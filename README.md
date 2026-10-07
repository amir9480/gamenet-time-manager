<div dir="rtl" align="right">

<h1 align="center">
  <img alt="نرم افزار مدیریت زمان گیم نت" src="public/img/banner.png" width="100%">
</h1>

<p align="center">
  <a href="https://amir9480.github.io/gamenet-time-manager/"><img alt="PWA online" src="https://img.shields.io/badge/PWA-online-5a0fc8?logo=pwa&logoColor=white"></a>
  <a href="https://github.com/amir9480/gamenet-time-manager/releases"><img alt="Version" src="https://img.shields.io/github/v/release/amir9480/gamenet-time-manager?include_prereleases&label=version"></a>
  <a href="https://github.com/amir9480/gamenet-time-manager/actions/workflows/deploy.yml"><img alt="Build" src="https://img.shields.io/github/actions/workflow/status/amir9480/gamenet-time-manager/deploy.yml?label=build"></a>
  <a href="LICENSE"><img alt="License" src="https://img.shields.io/github/license/amir9480/gamenet-time-manager?label=license"></a>
  <img alt="Platform" src="https://img.shields.io/badge/platform-Windows%20%7C%20Web-0078d4?logo=windows&logoColor=white">
  <a href="https://github.com/amir9480/gamenet-time-manager/issues"><img alt="Issues" src="https://img.shields.io/github/issues/amir9480/gamenet-time-manager?label=issues"></a>
</p>

<p align="center">
  برنامه‌ی رایگان و متن‌باز برای ثبت زمان و محاسبه‌ی هزینه‌ی تایم دستگاه‌های گیم نت؛
  بدون سرور و بدون ثبت‌نام، با داده‌هایی که فقط روی رایانه‌ی خودتان می‌مانند.
</p>

<p align="center">
  <a href="https://amir9480.github.io/gamenet-time-manager/"><b>🌐 اجرای نسخه‌ی آنلاین (PWA)</b></a>
  ·
  <a href="https://github.com/amir9480/gamenet-time-manager/releases"><b>⬇️ دانلود نسخه‌ی ویندوز</b></a>
</p>

## امکانات

- **تایم‌ها**: شروع، توقف و ادامه، تغییر دستگاه یا نرخ در میانه‌ی تایم، و محاسبه‌ی هزینه به ثانیه.
- **دستگاه‌ها و نرخ‌ها**: نوع دستگاه (پی‌سی، پلی‌استیشن، بیلیارد، پینگ‌پنگ و …)، ساخت گروهی دستگاه و چند نرخ ساعتی برای هر دستگاه.
- **بوفه و زمان اضافه**: موارد بوفه با دسته‌بندی و تعداد، و زمان اضافه با نرخ جداگانه.
- **مشتریان و نسیه**: پرونده‌ی مشتری، ثبت نسیه، دفتر بدهی و ثبت پرداخت.
- **محدودیت زمانی**: شمارش معکوس برای هر تایم با هشدار صوتی هنگام پایان.
- **تاریخچه و آمار**: فیلتر با تاریخ شمسی، نمودارها و خروجی CSV، XLSX و PDF.
- **قفل برنامه**: رمز ۴ تا ۸ رقمی با قفل خودکار.
- **پشتیبان‌گیری**: خروجی و بازیابی کامل داده‌ها با یک فایل JSON.
- **تم تیره و روشن**، رنگ‌بندی دلخواه، رابط راست‌به‌چپ با قلم وزیرمتن.
- **به‌روزرسانی**: اطلاع از نسخه‌ی جدید و امکان رد کردن آن.

## نصب

### نسخه‌ی وب (PWA)

۱. [نسخه‌ی آنلاین](https://amir9480.github.io/gamenet-time-manager/) را در مرورگر باز کنید.
۲. روی دکمه‌ی «نصب برنامه» بزنید (یا از منوی مرورگر «Install app»).

پس از نصب، برنامه بدون اینترنت هم کار می‌کند.

### نسخه‌ی ویندوز

آخرین فایل `gamenet-time-manager_*_x64-setup.exe` را از [صفحه‌ی انتشارها](https://github.com/amir9480/gamenet-time-manager/releases) دانلود و اجرا کنید.

> [!IMPORTANT]
> داده‌ها فقط روی همان مرورگر یا همان برنامه ذخیره می‌شوند و بین نسخه‌ی وب و ویندوز مشترک نیستند. پشتیبان‌گیری منظم (تنظیمات › داده‌ها) با خودتان است.

## توسعه

نیازمندی‌ها: [Node.js](https://nodejs.org) 22 به بالا، [pnpm](https://pnpm.io) و برای نسخه‌ی دسکتاپ [Rust](https://rustup.rs).

```bash
pnpm install
pnpm dev                      # نسخه‌ی وب روی http://localhost:3000
pnpm build                    # بررسی نوع‌ها و ساخت وب
pnpm tauri dev                # پنجره‌ی دسکتاپ
pnpm tauri build --bundles nsis   # نصب‌کننده‌ی ویندوز
```

فناوری‌ها: React، Vite، TypeScript، Tailwind CSS v4، shadcn/ui، Dexie (IndexedDB) و Tauri v2. راهنمای ساختار پروژه در [CLAUDE.md](CLAUDE.md) آمده است.

## انتشار نسخه

شماره‌ی نسخه از تگ گیت برداشته می‌شود. با ارسال تگ، هر دو نسخه ساخته می‌شوند، انتشار گیت‌هاب ایجاد می‌شود و سپس نسخه‌ی وب در GitHub Pages منتشر می‌شود:

```bash
git tag v0.1.0-beta.1
git push origin v0.1.0-beta.1
```

تگ‌هایی با پسوند (مثل `-beta.1`) به‌صورت پیش‌انتشار ثبت می‌شوند.

## مشارکت

مشارکت شما خوشحالمان می‌کند؛ ابتدا [راهنمای مشارکت](CONTRIBUTING.md) را بخوانید. برای گزارش خطا یا پیشنهاد، [یک مورد جدید](https://github.com/amir9480/gamenet-time-manager/issues/new/choose) باز کنید.

## مجوز

این پروژه با مجوز [MIT](LICENSE) منتشر شده است. ساخته‌ی [Amir Alizadeh](https://github.com/amir9480).

</div>
