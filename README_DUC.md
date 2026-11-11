# Zenzy

Ứng dụng mạng xã hội chia sẻ vị trí: bản đồ bạn bè theo thời gian thực, live pin, sự kiện, cửa hàng và flash deal, bảng tin, nhắn tin.

Repo gồm hai phần:

| Thư mục | Nội dung | Công nghệ |
|---|---|---|
| `zenzy_frontend/` | App di động (25 màn hình theo Figma) | Flutter 3.47 / Dart 3.13, MapLibre, Provider, go_router, Dio |
| `zenzy_backend/` | API server, chạy trong Docker | Node 22, NestJS 12, MongoDB (Atlas), JWT |

Dữ liệu mẫu đúng như thiết kế nằm ở một file duy nhất, dùng chung cho cả hai phía:
`zenzy_backend/seed/seed-data.json` (bản sao ở `zenzy_frontend/assets/sample/seed-data.json`).

---

## Mục lục

1. [Cài đặt cần có](#1-cài-đặt-cần-có)
2. [Chạy server](#2-chạy-server)
3. [Chạy app](#3-chạy-app)
4. [Cấu trúc thư mục](#4-cấu-trúc-thư-mục)
5. [App hoạt động như thế nào](#5-app-hoạt-động-như-thế-nào)
6. [Server hoạt động như thế nào](#6-server-hoạt-động-như-thế-nào)
7. [Kiểm tra và build](#7-kiểm-tra-và-build)
8. [Triển khai lên AWS](#8-triển-khai-lên-aws)
9. [Chưa làm](#9-chưa-làm)

---

## 1. Cài đặt cần có

- **Flutter SDK** 3.47 trở lên (`flutter doctor` không báo lỗi phần Android).
- **Android Studio** hoặc Android SDK + một emulator (ví dụ Pixel 8), hoặc điện thoại Android thật.
- **VS Code** với extension *Dart* và *Flutter* (không bắt buộc, có thể dùng Android Studio).
- **Node.js 22** và npm, hoặc **Docker Desktop** để chạy server.
- Tài khoản **MongoDB Atlas** (chuỗi kết nối `mongodb+srv://...`).

---

## 2. Chạy server

App vẫn chạy được khi không có server (hiện dữ liệu mẫu), nhưng muốn đăng ký, đăng nhập, đăng pin, nhắn tin... thì cần server.

### 2.1. Tạo file `.env`

```bash
cd zenzy_backend
cp .env.example .env
```

Điền vào `.env`:

| Biến | Ý nghĩa |
|---|---|
| `MONGODB_URI` | Chuỗi kết nối MongoDB Atlas |
| `MONGODB_DB` | Tên database, mặc định `Zenzy` |
| `JWT_SECRET` | Chuỗi ngẫu nhiên dài để ký token |
| `PORT` | Cổng lắng nghe (mặc định 8080) |
| `JWT_EXPIRES_IN` | Thời hạn token, mặc định `30d` |
| `CORS_ORIGIN` | Origin được phép, `*` = tất cả |
| `SEED_ON_BOOT` | `false` để tắt tự nạp dữ liệu mẫu |

Tạo `JWT_SECRET`:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

> `.env` đã nằm trong `.gitignore`. Không commit file này.

### 2.2. Chạy

App mặc định gọi server ở cổng **8787** của máy tính.

**Cách A – Docker** (cổng 8787 của máy → 8080 trong container):

```bash
docker compose up --build
```

**Cách B – Node trực tiếp** (PowerShell):

```powershell
npm install
$env:PORT=8787; npm run dev
```

Kiểm tra: mở <http://localhost:8787/v1/health>, thấy `{"status":"ok"}` là được.

Lần chạy đầu, nếu database còn trống, server tự nạp dữ liệu mẫu. Nạp lại bất cứ lúc nào bằng `npm run seed` (chỉ ghi đè dữ liệu mẫu, không xoá dữ liệu người dùng tạo).

---

## 3. Chạy app

### 3.1. Lần đầu

```bash
cd zenzy_frontend
flutter pub get
```

### 3.2. Từ VS Code (giống nút Run của Android Studio)

1. **File → Open Folder** → mở thư mục **`zenzy_frontend`** (không mở thư mục gốc).
2. Góc phải dưới thanh trạng thái: chọn thiết bị (emulator hoặc điện thoại).
3. Tab **Run and Debug** (Ctrl+Shift+D) → chọn cấu hình → **F5**.

| Cấu hình | Dùng khi | App gọi server ở |
|---|---|---|
| **Zenzy (emulator)** | Chạy trên emulator Android | `http://10.0.2.2:8787/v1` (10.0.2.2 = máy tính, nhìn từ emulator) |
| **Zenzy (điện thoại thật)** | Điện thoại cắm cáp hoặc gỡ lỗi qua Wi‑Fi | `http://127.0.0.1:8787/v1`, kèm task `adb reverse` tự chuyển cổng 8787 của điện thoại về máy tính |

Khi app đang chạy: lưu file là cập nhật ngay (hot reload), **Ctrl+Shift+F5** để khởi động lại.

### 3.3. Từ dòng lệnh

```bash
flutter run                                    # emulator
flutter run --dart-define=API_BASE_URL=http://127.0.0.1:8787/v1   # điện thoại (chạy adb reverse trước)
```

### 3.4. Chuẩn bị điện thoại thật

1. **Cài đặt → Thông tin điện thoại** → bấm 7 lần vào **Số hiệu bản tạo** để bật *Tùy chọn nhà phát triển*.
2. Bật **Gỡ lỗi USB**. Xiaomi/Oppo bật thêm **Cài đặt qua USB**.
3. Cắm cáp, chọn **Luôn cho phép** khi điện thoại hỏi.

Không có thiết bị trong danh sách: chạy `flutter devices`; trên Windows có thể cần USB driver của hãng hoặc *Google USB Driver* (Android Studio → SDK Manager).

### 3.5. Chạy không dây (Wi‑Fi)

Tính năng *Pair Devices Using Wi‑Fi* trong Device Manager của Android Studio là gỡ lỗi qua **Wi‑Fi** (không phải Bluetooth). VS Code và Android Studio dùng chung `adb`, nên ghép đôi bằng Android Studio xong là VS Code thấy điện thoại. Hoặc ghép bằng lệnh:

1. Điện thoại và máy tính cùng mạng Wi‑Fi.
2. Điện thoại: **Tùy chọn nhà phát triển → Gỡ lỗi không dây** → **Ghép nối thiết bị bằng mã ghép nối**.
3. Ghép đôi (một lần) rồi kết nối (mỗi khi mất kết nối):

```powershell
$adb = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
& $adb pair    192.168.1.23:37123 123456   # IP:cổng và mã trên màn ghép nối
& $adb connect 192.168.1.23:41567          # IP:cổng ở màn chính của Gỡ lỗi không dây
```

4. Chạy cấu hình **Zenzy (điện thoại thật)**.

### 3.6. Mở thẳng một màn hình (để debug / chụp so sánh)

```bash
adb shell am start -S -n com.zenzy.zenzy_frontend/.MainActivity --es route /feed
flutter run --dart-define=START_ROUTE=/feed
```

| Đường dẫn | Màn hình |
|---|---|
| `/` | 01 Splash |
| `/login`, `/register` | 02 Login, Register |
| `/home` | 03 Home Map |
| `/nearby/loading`, `/nearby/ghost`, `/nearby/error` | 04–06 Nearby |
| `/privacy` | 07 Location Privacy |
| `/shop/zenzy-coffee` | 08 Shop & Flash Deals |
| `/event/weekly-soccer-run` | 09 Event & RSVP |
| `/feed` | 10 Newsfeed |
| `/messages`, `/messages/empty` | 11 Messages, Messages empty |
| `/conversation/zoe` | Conversation |
| `/notifications` | 12 Notifications |
| `/profile` | 13 Social Profile |
| `/create-pin` | 14 Create Live Pin |
| `/shop-create`, `/my-shop` | Create shop, My shop |
| `/live/map`, `/live/create`, `/live/pin`, `/live/loading`, `/live/lost` | Luồng live pin, Loading, Connection lost |

### 3.7. Gửi bản demo

```bash
flutter build apk --debug
```

File: `zenzy_frontend/build/app/outputs/flutter-apk/app-debug.apk`. Không nối được server thì app tự hiện dữ liệu mẫu.

---

## 4. Cấu trúc thư mục

```text
Zenzycopy/
├── README_DUC.md                 ← file này
├── FLUTTER_PORT_PROMPT.md        yêu cầu gốc khi port từ Kotlin sang Flutter
├── UI Mockup/                    ảnh xuất từ Figma để so sánh
│
├── zenzy_frontend/               APP FLUTTER
│   ├── .vscode/                  launch.json (2 cấu hình chạy) + tasks.json (adb reverse)
│   ├── android/                  project Android (quyền Internet, vị trí)
│   ├── assets/
│   │   ├── svg/<màn hình>/       icon, minh hoạ xuất từ Figma (s01…s14, reg, conv, flow, …)
│   │   ├── images/               ảnh PNG: avatar, ảnh quán, ảnh bài đăng, …
│   │   ├── fonts/                Inter, Rubik, Gabarito (variable font)
│   │   └── sample/seed-data.json dữ liệu mẫu (bản sao của server)
│   ├── tool/fix_masked_svgs.py   sửa SVG Figma bị mask che nét
│   ├── test/widget_test.dart     kiểm tra dữ liệu mẫu parse đúng
│   └── lib/
│       ├── main.dart             khởi động: edge-to-edge, khoá dọc, nạp dữ liệu mẫu
│       ├── app.dart              MaterialApp + DI + router + scale 402px
│       ├── core/
│       │   ├── config/env.dart           địa chỉ API, tâm bản đồ, style bản đồ
│       │   ├── constants/                đường dẫn API, khoá lưu trữ
│       │   ├── data/sample_data.dart     đọc dữ liệu mẫu từ assets
│       │   ├── design/design.dart        màu, font, chữ, SVG, ảnh, bóng đổ, scale
│       │   ├── di/providers.dart         tạo ApiClient + các repository
│       │   ├── error/app_exception.dart  lỗi API (mạng / mã HTTP)
│       │   ├── network/                  Dio client + gắn Bearer token
│       │   ├── router/                   go_router, danh sách route
│       │   ├── ui_state/view_state.dart  LoadViewModel / Loader: mẫu trước, API sau
│       │   └── widgets/                  bottom nav, khung màn hình, toast
│       ├── features/<tính năng>/
│       │   ├── model/                    lớp dữ liệu + fromJson
│       │   ├── repository/               gọi API của tính năng
│       │   └── view/                     màn hình
│       └── services/secure_storage_service.dart   lưu JWT
│
└── zenzy_backend/                SERVER
    ├── Dockerfile, docker-compose.yml
    ├── deploy/docker-compose.aws.yml   API + Caddy (HTTPS) cho EC2
    ├── seed/seed-data.json             dữ liệu mẫu
    ├── README.md                       tài liệu API chi tiết
    └── src/
        ├── main.ts                     khởi động, prefix /v1, CORS, log request
        ├── app.module.ts               ghép các module + /health
        ├── seed.ts                     lệnh npm run seed
        ├── common/                     config, kết nối MongoDB, JWT, tiện ích, nạp seed
        └── auth/ users/ locations/ shops/ events/ posts/ chat/ notifications/
                                        mỗi module = controller (route) + service (logic)
```

Các tính năng trong `lib/features/`: `auth`, `map`, `shops`, `events`, `feed`, `chat`, `notifications`, `privacy`, `profile`.

> Repo còn khoảng 90 file Dart chỉ có dòng `// TODO` (viewmodel, service, friends, report, l10n, test trong `test/features/`) và các module server rỗng `friendships/`, `reports/`, `chat/chat.gateway.ts`. Đây là khung dựng sẵn từ trước, chưa dùng tới.

---

## 5. App hoạt động như thế nào

### 5.1. Giao diện giống Figma

- **Scale 402px:** mọi frame Figma rộng 402px. `DesignScale` (trong `core/design/design.dart`) scale toàn bộ UI sao cho chiều rộng màn hình = 402 đơn vị, nên code dùng thẳng số px của Figma trên mọi điện thoại. Cỡ chữ hệ thống không ảnh hưởng.
- **Widget dựng sẵn:** `T` (chữ theo Figma), `Svg`, `Img`, `Bx` (hộp có nền, bo góc, viền, bóng, bấm), `Col`/`Rw` (cột/hàng có khoảng cách), `zShadow` (bóng đổ đúng thông số Figma).
- **Màu:** lớp `Z` (navy `#1A1B2F`, coral `#FF5C5C`, …), bảng màu riêng cho luồng live pin (ink, indigo, rose, …).
- **Font:** Inter cho màn chính; Rubik + Gabarito cho luồng live pin và Messages empty.
- **Status bar / navigation bar:** dùng của Android thật, không vẽ thanh "9:41" của iOS.

### 5.2. Luồng dữ liệu

```text
Màn hình ──► Loader / LoadViewModel ──► Repository ──► ApiClient (Dio) ──► Server /v1
                │
                └─ hiện ngay dữ liệu mẫu (SampleData), có kết quả API thì thay vào;
                   API lỗi / mất mạng → giữ dữ liệu mẫu
```

- Mỗi màn có dữ liệu tạo một `Loader` với `load` (hàm gọi repository) và `initial` (dữ liệu mẫu). Nhờ vậy màn hình luôn hiện đúng thiết kế, kể cả khi không có server.
- `ApiClient` gắn `Authorization: Bearer <token>` nếu đã đăng nhập, đổi lỗi Dio thành `AppException` (`isNetwork` = không tới được máy chủ).
- Repository được tạo một lần trong `core/di/providers.dart` và lấy ra bằng `context.read<...>()`.

### 5.3. Đăng nhập

- Login / Register gọi `/auth/login`, `/auth/register`, lưu JWT vào Secure Storage.
- Để trống các ô rồi bấm nút = vào app với tư cách **khách** (xem dữ liệu mẫu).
- Không tới được server: vẫn vào app và báo "đang dùng dữ liệu mẫu".
- Thao tác ghi (đăng pin, RSVP, gửi tin, lưu shop, đổi cài đặt riêng tư) khi là khách: chạy theo luồng giao diện, chỉ thay đổi trên máy.

### 5.4. Bản đồ

- `features/map/view/widgets/zenzy_map.dart`: **MapLibre** + tile **OpenFreeMap** (style positron), miễn phí, không cần API key. Tâm Thảo Điền, TP.HCM (`10.8035, 106.7350`), zoom 15.2; tắt xoay/nghiêng, ẩn logo và la bàn, giữ nút attribution.
- **Pin** là widget Flutter đặt lên trên bản đồ, gắn với toạ độ địa lý (tính bằng phép chiếu Web Mercator), nên di chuyển theo bản đồ khi kéo/zoom. Toạ độ pin lấy từ vị trí pixel trong Figma.
- **Nút định vị:** lần đầu xin quyền vị trí (`geolocator`), sau đó hiện chấm vị trí và đưa camera về người dùng (zoom 16).
- Dùng cho Home Map và bản đồ luồng live pin. Bản đồ nhỏ ở 3 màn Nearby và màn Event là hình minh hoạ như Figma.

### 5.5. Điều hướng

- `go_router`; bottom nav dùng `go` (thay cả ngăn xếp), các màn con dùng `push`; nút back hệ thống quay lại màn trước.
- Hai kiểu bottom nav: **Map · Feed · + · Chat · Profile** (màn chính) và **Home · Feed · Message · Alerts · Profile** kèm nút `+` nổi (luồng live pin). Tab đang mở được tô sáng.

```text
Splash ─ Get Started ─► Register ─┐
       └ I already have an account ► Login ─┴─► Home Map
Home Map: pin cà phê/túi, chip Shops ► Shop · pin sự kiện, chip Events, Join ► Event
          chip Friends, nút filter ► Nearby Loading ► Ghost Mode ► Connection Error ► (Retry) Loading
          banner "You're offline" ► Connection lost · nút góc phải ► Location Privacy
Event ─ Message ► Conversation ─ View on map ► Home Map
Newsfeed ─ chuông ► Notifications
Messages ─ dòng Zoe ► Conversation · tìm kiếm ► Messages empty ─ Find friends nearby ► Nearby
Profile ─ Create shop ► Create shop ─► My shop ─ Edit shop ► Create shop · bánh răng ► Location Privacy
Nút + ► Create Live Pin ─ Post to Map ► bản đồ live pin ("Your pin is live")
Bản đồ live pin: + ► sheet Create Live Pin (Post chỉ bật khi có tiêu đề + mô tả) ► pin live
                 Connection lost ─ Retry ► Loading ─ chạm ► bản đồ
```

### 5.6. Asset

- SVG và PNG copy từ project Kotlin (`AndroidStudioProjects/zenzy`), tên file theo màn hình (`s08_cafe.png`, `svg/s03/coffee.svg`, …).
- Figma xuất nét viền dạng *mask*, khiến `flutter_svg` ẩn mất phần nét nằm ngoài hình (ví dụ cán kính lúp). `tool/fix_masked_svgs.py` tách các nét đó ra khỏi mask, hình dạng không đổi. Chạy lại sau khi copy SVG mới:

```bash
python tool/fix_masked_svgs.py
```

---

## 6. Server hoạt động như thế nào

- **NestJS**, mọi route có prefix `/v1`. Mỗi tính năng là một module: controller khai báo route, service chứa logic và truy vấn MongoDB.
- **MongoDB** qua driver chính thức (không dùng Mongoose). Các collection: `users`, `map_pins`, `activities`, `settings`, `shops`, `events`, `posts`, `conversations`, `messages`, `notifications`.
- **Xác thực:** JWT ký bằng `JWT_SECRET`, mật khẩu băm bằng bcrypt.
  - Route **đọc** cho phép khách (không token) và trả dữ liệu của người dùng mẫu (Clara).
  - Route **ghi** cần token, thiếu hoặc sai trả `401`.
- **Lỗi** luôn có dạng `{ code, message, timestamp }`.
- **Live pin** tự hết hạn sau 2 giờ (TTL index trên `expires_at`). Pin "Close Friends" chỉ trả về cho chính chủ.
- **RSVP** cập nhật nguyên tử: chỉ tăng số người khi còn chỗ và người đó chưa tham gia.
- **Log:** mỗi request ghi một dòng `METHOD đường-dẫn mã thời-gian`.

### API chính

| Method | Đường dẫn | Màn hình | Cần token |
|---|---|---|---|
| GET | `/health` | health check | |
| POST | `/auth/register`, `/auth/login` | Register, Login | |
| GET | `/me`, `/me/profile` | Social Profile | |
| GET / PUT | `/me/privacy` | Location Privacy | PUT ✔ |
| GET | `/me/shop` | My shop | |
| GET | `/map/pins?view=main\|flow` | Home Map, bản đồ live pin | |
| POST | `/pins` | Create Live Pin | ✔ |
| GET / POST | `/shops`, `/shops/:id` | Shop, Create shop | POST ✔ |
| GET | `/events/:id` · POST `/events/:id/join` | Event & RSVP | join ✔ |
| GET | `/posts` | Newsfeed | |
| GET | `/conversations`, `/conversations/:id` · POST `/conversations/:id/messages` | Messages, Conversation | POST ✔ |
| GET | `/notifications` | Notifications | |

Chi tiết body của từng route: `zenzy_backend/README.md`.

---

## 7. Kiểm tra và build

```bash
# App
cd zenzy_frontend
flutter analyze
flutter test test/widget_test.dart
flutter build apk --debug

# Server
cd zenzy_backend
npm run typecheck
npm run build
docker build -t zenzy-api .
```

---

## 8. Triển khai lên AWS

Tóm tắt (chi tiết ở `zenzy_backend/README.md`):

1. Tạo máy **EC2**, Security Group mở cổng 22, 80, 443.
2. Trỏ bản ghi DNS `A` của tên miền API (ví dụ `api.ten-mien.com`) về IP của máy.
3. **MongoDB Atlas → Network Access:** thêm IP của máy EC2.
4. Trên EC2: cài Docker, clone repo, tạo `zenzy_backend/.env`, rồi chạy:

```bash
cd zenzy_backend
DOMAIN=api.ten-mien.com docker compose -f deploy/docker-compose.aws.yml up -d --build
```

Caddy tự xin chứng chỉ HTTPS. Kiểm tra `https://api.ten-mien.com/v1/health`.

5. Build app trỏ về tên miền:

```bash
flutter build apk --dart-define=API_BASE_URL=https://api.ten-mien.com/v1
```

---

## 9. Chưa làm

- Realtime (Socket.IO): vị trí bạn bè và tin nhắn chưa cập nhật tức thời.
- Bạn bè / chặn, báo cáo vi phạm, trang admin.
- Upload ảnh, đăng nhập Google, refresh token, push notification, giới hạn tần suất request.
- Các nút chưa có chức năng trong thiết kế: Edit Profile, POST ở My shop, Directions, View all, Mark all read, bookmark, like.
- Chưa deploy lên AWS; chưa thử trên điện thoại thật.
