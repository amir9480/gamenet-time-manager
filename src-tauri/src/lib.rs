use futures_util::StreamExt;
use std::io::Write;
use tauri::Emitter;

// Only installers published on this project's GitHub releases may be downloaded and run.
const RELEASE_PREFIX: &str = "https://github.com/amir9480/gamenet-time-manager/releases/download/";

// The temp-dir path for a release asset name (e.g. `gamenet-time-manager_1.2.0_x64-setup.exe`).
// Named per version so a still-open installer from an earlier update never blocks the download.
fn installer_path(name: &str) -> Option<std::path::PathBuf> {
  let valid = name.starts_with("gamenet-time-manager")
    && name.ends_with("-setup.exe")
    && name.chars().all(|c| c.is_ascii_alphanumeric() || "._-".contains(c));
  valid.then(|| std::env::temp_dir().join(name))
}

#[derive(Clone, serde::Serialize)]
struct Progress {
  downloaded: u64,
  total: u64,
}

// Downloads a release installer to the temp dir (emitting `update-progress`) and returns its path.
#[tauri::command]
async fn download_installer(app: tauri::AppHandle, url: String) -> Result<String, String> {
  let path = url
    .strip_prefix(RELEASE_PREFIX)
    .and_then(|rest| rest.rsplit('/').next())
    .and_then(installer_path)
    .ok_or("invalid installer url")?;
  let res = reqwest::get(&url)
    .await
    .and_then(|r| r.error_for_status())
    .map_err(|e| e.to_string())?;
  let total = res.content_length().unwrap_or(0);
  let mut file = std::fs::File::create(&path).map_err(|e| e.to_string())?;
  let mut stream = res.bytes_stream();
  let mut downloaded = 0u64;
  while let Some(chunk) = stream.next().await {
    let chunk = chunk.map_err(|e| e.to_string())?;
    file.write_all(&chunk).map_err(|e| e.to_string())?;
    downloaded += chunk.len() as u64;
    let _ = app.emit("update-progress", Progress { downloaded, total });
  }
  Ok(path.to_string_lossy().into_owned())
}

// Starts the downloaded installer as a detached process (it keeps running after this app exits).
#[tauri::command]
fn run_installer(path: String) -> Result<(), String> {
  let installer = std::path::Path::new(&path)
    .file_name()
    .and_then(|n| n.to_str())
    .and_then(installer_path)
    .filter(|p| p == std::path::Path::new(&path) && p.is_file())
    .ok_or("invalid installer path")?;
  let mut cmd = std::process::Command::new(installer);
  // Same flags Tauri's own updater uses with its NSIS template: /UPDATE skips the "uninstall the
  // existing version" page (installs over it, keeping app data), /P shows only the progress
  // window without any prompt, /R relaunches the app when it is done.
  cmd.args(["/P", "/UPDATE", "/R"]);
  #[cfg(windows)]
  {
    use std::os::windows::process::CommandExt;
    const DETACHED_PROCESS: u32 = 0x0000_0008;
    const CREATE_NEW_PROCESS_GROUP: u32 = 0x0000_0200;
    cmd.creation_flags(DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP);
  }
  cmd.spawn().map(|_| ()).map_err(|e| e.to_string())
}

// Web-style download: asks where to save (native Save dialog, starting in Downloads) and writes
// the raw request body there. The file name comes URI-encoded in the `x-file-name` header.
// Returns false when the user cancels.
#[tauri::command]
async fn save_file(app: tauri::AppHandle, request: tauri::ipc::Request<'_>) -> Result<bool, String> {
  use tauri::Manager;
  use tauri_plugin_dialog::DialogExt;
  let tauri::ipc::InvokeBody::Raw(data) = request.body() else {
    return Err("expected raw file data".into());
  };
  let name = request
    .headers()
    .get("x-file-name")
    .and_then(|v| v.to_str().ok())
    .and_then(|v| percent_decode(v))
    .ok_or("missing file name")?;
  let mut dialog = app.dialog().file().set_file_name(&name);
  if let Some(ext) = std::path::Path::new(&name).extension().and_then(|e| e.to_str()) {
    dialog = dialog.add_filter(ext.to_uppercase(), &[ext]);
  }
  if let Ok(dir) = app.path().download_dir() {
    dialog = dialog.set_directory(dir);
  }
  let Some(path) = dialog.blocking_save_file() else {
    return Ok(false);
  };
  let path = path.into_path().map_err(|e| e.to_string())?;
  std::fs::write(path, data).map_err(|e| e.to_string())?;
  Ok(true)
}

// Decodes `encodeURIComponent` output (UTF-8 percent escapes).
fn percent_decode(s: &str) -> Option<String> {
  let bytes = s.as_bytes();
  let mut out = Vec::with_capacity(bytes.len());
  let mut i = 0;
  while i < bytes.len() {
    if bytes[i] == b'%' {
      let hex = s.get(i + 1..i + 3)?;
      out.push(u8::from_str_radix(hex, 16).ok()?);
      i += 3;
    } else {
      out.push(bytes[i]);
      i += 1;
    }
  }
  String::from_utf8(out).ok()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  let mut builder = tauri::Builder::default();

  #[cfg(desktop)]
  {
    // Must be the first plugin: a second launch exits right away and focuses the running window.
    builder = builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
      use tauri::Manager;
      if let Some(win) = app.get_webview_window("main") {
        let _ = win.unminimize();
        let _ = win.show();
        let _ = win.set_focus();
      }
    }));
    builder = builder.plugin(tauri_plugin_autostart::init(
      tauri_plugin_autostart::MacosLauncher::LaunchAgent,
      None,
    ));
  }

  builder
    .plugin(tauri_plugin_dialog::init())
    .invoke_handler(tauri::generate_handler![download_installer, run_installer, save_file])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while building tauri application");
}
