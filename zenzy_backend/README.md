# Zenzy API

Server NestJS + MongoDB cho app Zenzy, đóng gói bằng Docker để chạy trên AWS.

## Chạy trên máy

```bash
cp .env.example .env      # điền MONGODB_URI và JWT_SECRET
npm install
PORT=8787 npm run dev     # http://localhost:8787/v1/health
```

Hoặc chạy trong container (cổng 8787 của máy → 8080 trong container):

```bash
docker compose up --build
```

Lần chạy đầu, nếu database còn trống, server tự nạp dữ liệu mẫu từ `seed/seed-data.json`
(đúng nội dung thiết kế Figma). Nạp lại bằng `npm run seed`; lệnh này chỉ ghi đè tài liệu mẫu,
không xoá dữ liệu người dùng tạo.

## Biến môi trường

| Biến | Ý nghĩa |
|---|---|
| `PORT` | Cổng lắng nghe (mặc định 8080) |
| `MONGODB_URI` | Chuỗi kết nối MongoDB Atlas |
| `MONGODB_DB` | Tên database (mặc định `Zenzy`) |
| `JWT_SECRET` | Khoá ký JWT, chuỗi ngẫu nhiên dài |
| `JWT_EXPIRES_IN` | Thời hạn token (mặc định `30d`) |
| `CORS_ORIGIN` | Origin được phép, cách nhau bởi dấu phẩy; `*` = tất cả |
| `SEED_ON_BOOT` | `false` để tắt tự nạp dữ liệu mẫu |

## API (prefix `/v1`)

Route đọc cho phép khách (không token) và trả về dữ liệu của người dùng mẫu.
Route ghi cần header `Authorization: Bearer <access_token>`.
Lỗi luôn có dạng `{ code, message, timestamp }`.

| Method | Đường dẫn | Màn hình dùng | Cần đăng nhập |
|---|---|---|---|
| GET | `/health` | health check | |
| POST | `/auth/register` `{ full_name, email, password, date_of_birth? }` | Register | |
| POST | `/auth/login` `{ email, password }` | Login | |
| GET | `/me` | | |
| GET | `/me/profile` | Social Profile | |
| GET | `/me/privacy` | Location Privacy | |
| PUT | `/me/privacy` `{ ghost_mode?, audience?, precise? }` | Location Privacy | ✔ |
| GET | `/me/shop` | My shop | |
| GET | `/map/pins?view=main\|flow` | Home Map, bản đồ luồng live pin | |
| POST | `/pins` `{ type, title, description, audience }` | Create Live Pin | ✔ |
| GET | `/shops`, `/shops/:id` | Shop & Flash Deals | |
| POST | `/shops` `{ name, address, opening, closing, menu[] }` | Create shop | ✔ |
| GET | `/events`, `/events/:id` | Event & RSVP | |
| POST | `/events/:id/join` | Event & RSVP | ✔ |
| GET | `/posts` | Newsfeed | |
| GET | `/conversations`, `/conversations/:id` | Messages, Conversation | |
| POST | `/conversations/:id/messages` `{ text }` | Conversation | ✔ |
| GET | `/notifications` | Notifications | |

Ảnh trong dữ liệu mẫu là tên asset đóng gói sẵn trong app (ví dụ `s08_cafe`); app cũng nhận URL `http(s)`.

## Triển khai lên AWS (EC2 + Docker + HTTPS)

1. Tạo máy EC2 (Amazon Linux 2023 hoặc Ubuntu, `t3.small` là đủ), Security Group mở cổng 22, 80, 443.
2. Trỏ bản ghi DNS `A` của tên miền API (ví dụ `api.ten-mien.com`) về IP công khai của máy.
3. Trong MongoDB Atlas → Network Access, thêm IP công khai của máy EC2.
4. Trên máy EC2: cài Docker + plugin compose, chép thư mục `zenzy_backend` lên (git clone), tạo file `.env`.
5. Chạy:

   ```bash
   DOMAIN=api.ten-mien.com docker compose -f deploy/docker-compose.aws.yml up -d --build
   ```

   Caddy tự xin chứng chỉ HTTPS. Kiểm tra: `https://api.ten-mien.com/v1/health`.
6. Build app trỏ về tên miền:

   ```bash
   flutter build apk --dart-define=API_BASE_URL=https://api.ten-mien.com/v1
   ```

Muốn dùng ECS Fargate / App Runner thay cho EC2: đẩy image `zenzy-api` (từ `Dockerfile`) lên ECR,
cấu hình cổng container 8080, health check `/v1/health`, và đặt các biến môi trường ở trên
(nên lưu `MONGODB_URI`, `JWT_SECRET` trong Secrets Manager).

## Chưa làm (so với Zenzy_Specification)

Realtime Socket.IO, bạn bè/chặn, báo cáo vi phạm, admin, upload ảnh, refresh token, push notification,
đăng nhập Google, giới hạn tần suất request. Các thư mục `friendships/`, `reports/` vẫn là khung trống.
