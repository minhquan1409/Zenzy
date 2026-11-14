# Zenzy – Backend API (branch `duc`)

Branch này chỉ chứa phần việc của tôi: **API server** trả dữ liệu cho app Zenzy.
Code app/giao diện (`zenzy_frontend/`) giữ nguyên như branch `main`; nhóm app phụ trách phần đó.

| Thư mục | Nội dung | Công nghệ |
|---|---|---|
| `zenzy_backend/` | API server | Node 22, NestJS, MongoDB (Atlas), JWT, Docker |
| `UI Mockup/` | Ảnh xuất từ Figma, dùng để đối chiếu dữ liệu API với màn hình | |

Dữ liệu mẫu đúng như thiết kế nằm ở `zenzy_backend/seed/seed-data.json`.

---

## 1. Cài đặt cần có

- **Node.js 22** và npm, hoặc **Docker Desktop**.
- Tài khoản **MongoDB Atlas** (chuỗi kết nối `mongodb+srv://...`).

## 2. Chạy server (chỉ localhost)

### 2.1. Tạo file `.env`

```bash
cd zenzy_backend
cp .env.example .env
```

| Biến | Ý nghĩa |
|---|---|
| `MONGODB_URI` | Chuỗi kết nối MongoDB Atlas |
| `MONGODB_DB` | Tên database, mặc định `zenzylocaldemo` (DB riêng cho localhost, cùng cluster với `Zenzy`)  Tự tạo của riêng mình vì bản chính ko dc truy cập tùy tiện , phải thông qua backend và api
| `JWT_SECRET` | Chuỗi ngẫu nhiên dài để ký token |
| `JWT_EXPIRES_IN` | Thời hạn token, mặc định `30d` |
| `SEED_ON_BOOT` | `false` để tắt tự nạp dữ liệu mẫu |

Tạo `JWT_SECRET`:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

> `.env` đã nằm trong `.gitignore`. Không commit file này.

### 2.2. Địa chỉ server: một file duy nhất

Server chỉ lắng nghe trên `127.0.0.1` (máy khác trong mạng không gọi được).
Host, cổng, URL công khai và CORS nằm ở **đúng một chỗ**: khối `address` trong
`zenzy_backend/src/common/config.ts`. `main.ts`, `healthcheck.ts`, Docker health check và
`npm run health` đều đọc từ đó. Khi deploy chỉ sửa khối này.

Mặc định: `http://127.0.0.1:8787/v1`.

### 2.3. Chạy

**Cách A – Node trực tiếp:**

```bash
npm install
npm run dev
```

**Cách B – Docker** (cổng chỉ mở trên localhost, xem `docker-compose.yml`):

```bash
docker compose up --build
```

Kiểm tra: ở terminal khác chạy `npm run health`, thấy `{"status":"ok"}` là được.

Lần chạy đầu, nếu database còn trống, server tự nạp dữ liệu mẫu. Nạp lại bằng `npm run seed`
(chỉ ghi đè dữ liệu mẫu, không xoá dữ liệu người dùng tạo).

### 2.4. App gọi server trên máy

App trỏ tới `http://127.0.0.1:8787/v1`. Emulator hoặc điện thoại Android cần chuyển cổng về máy tính:

```bash
adb reverse tcp:8787 tcp:8787
```

---

## 3. Cấu trúc thư mục

```text
zenzy_backend/
├── Dockerfile, docker-compose.yml
├── deploy/docker-compose.aws.yml   API + Caddy (HTTPS) cho EC2
├── seed/seed-data.json             dữ liệu mẫu
├── README.md                       tài liệu API chi tiết
└── src/
    ├── main.ts                     khởi động, prefix /v1, CORS, log request
    ├── healthcheck.ts              gọi /v1/health (Docker + npm run health)
    ├── app.module.ts               ghép các module + /health
    ├── seed.ts                     lệnh npm run seed
    ├── common/                     config (địa chỉ server), MongoDB, JWT, tiện ích, nạp seed
    └── auth/ users/ locations/ shops/ events/ posts/ chat/ notifications/
                                    mỗi module = controller (route) + service (logic)
```

## 4. Server hoạt động như thế nào

- **NestJS**, mọi route có prefix `/v1`. Mỗi tính năng là một module: controller khai báo route, service chứa logic và truy vấn MongoDB.
- **MongoDB** qua driver chính thức. Collection: `users`, `map_pins`, `activities`, `settings`, `shops`, `events`, `posts`, `conversations`, `messages`, `notifications`.
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

## 5. Kiểm tra và build

```bash
cd zenzy_backend
npm run typecheck
npm run build
docker build -t zenzy-api .
```

## 6. Khi deploy (sau này)

1. Sửa khối `address` trong `zenzy_backend/src/common/config.ts` (`publicUrl`, `corsOrigin`, …).
2. Chạy `deploy/docker-compose.aws.yml` trên EC2 (chi tiết ở `zenzy_backend/README.md`).
3. Báo nhóm app URL mới.

## 7. Lưu ý : 
đây là bản localhost , ko có tính năng này : chỉ có bản chính thức với api đã gửi, đã deploy trên aws gọi về mới có đầy đủ tính năng này (protocal gọi như trong file swagger và postman có thể dùng để test thử

- Realtime (Socket.IO): vị trí bạn bè và tin nhắn chưa cập nhật tức thời.
- Bạn bè / chặn, báo cáo vi phạm, trang admin.
- Upload ảnh, đăng nhập Google, refresh token, push notification, giới hạn tần suất request.
- Chưa deploy lên AWS.
