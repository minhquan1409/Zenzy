# Prompt: dựng lại app Zenzy bằng Flutter/Dart

Dán toàn bộ nội dung dưới đây vào phiên làm việc ở thư mục project Flutter.

---

## Mục tiêu

Dựng app **Zenzy** (app mạng xã hội chia sẻ vị trí) bằng **Flutter/Dart**, giao diện giống hệt thiết kế Figma. App này đã được dựng xong bằng Kotlin/Jetpack Compose ở `C:\Users\Duc\AndroidStudioProjects\zenzy`; hãy dùng project đó làm bản tham chiếu và nguồn asset, nhưng viết lại bằng Flutter, không sửa gì trong project Kotlin.

## Yêu cầu của tôi (rút gọn)

1. Triển khai UI từ file Figma **"Map (Community) (Copy)"**: `https://www.figma.com/design/cSaSnmIXqor34qmhB95W2n/Map--Community---Copy-` (file key `cSaSnmIXqor34qmhB95W2n`).
2. Chỉ cần UI và các nút bấm đơn giản để nối các màn hình với nhau; dữ liệu là dữ liệu mẫu tĩnh như trong thiết kế, chưa gọi API.
3. Mọi thứ phải trông **giống hệt Figma** (kích thước, màu, font, icon, ảnh, bóng đổ).
4. Nếu thiếu file ảnh/asset nào không lấy được thì báo cho tôi, không tự vẽ thay.
5. Đóng gói sẵn font của thiết kế vào app.
6. Bản đồ phải là bản đồ thật, kéo/zoom được, **miễn phí và không cần API key** (không dùng Google Maps).
7. Có nút "định vị lại bản thân" giống Google Maps.
8. Backend làm riêng (theo `C:\Users\Duc\Downloads\Zenzy_Specification.pdf`, triển khai trên AWS, code ở thư mục `server/` của project Kotlin). **Không làm backend trong phiên này**; chỉ tổ chức code sao cho sau này dễ nối API.

## Danh sách 25 màn hình (kèm node ID Figma)

Nhóm chính (section `2203:477`):

| # | Màn hình | Node ID |
|---|---|---|
| 01 | Splash | `206:6` |
| 02 | Login | `206:32` |
| 03 | Home Map | `206:75` |
| 04 | Nearby – Loading | `266:3703` |
| 05 | Nearby – Ghost Mode | `266:3794` |
| 06 | Nearby – Connection Error | `266:3880` |
| 07 | Location Privacy | `266:3960` |
| 08 | Shop & Flash Deals | `266:4044` |
| 09 | Event & RSVP | `266:4666` |
| 10 | Newsfeed | `210:8` |
| 11 | Messages | `210:163` |
| 12 | Notifications | `210:273` |
| 13 | Social Profile | `210:358` |
| 14 | Create Live Pin | `210:433` |

Các frame khác:

| Màn hình | Node ID |
|---|---|
| Register | `2270:245` |
| Conversation | `2234:255` |
| My shop | `2273:454` |
| Create shop | `2273:355` |
| Messages empty | `266:14534` |
| Luồng live pin 01 – Home map | `266:13816` |
| Luồng live pin 02 – Create live pin (form trống) | `266:13935` |
| Luồng live pin 03 – Event ready to post (form đã điền) | `266:14108` |
| Luồng live pin 04 – Pin live on map | `266:14281` |
| Loading (skeleton trên bản đồ) | `266:14413` |
| Connection lost (hộp thoại trên bản đồ) | `266:14600` |

## Dùng lại từ project Kotlin (đỡ phải tải lại từ Figma)

Toàn bộ asset đã được xuất từ Figma và nằm sẵn trong project Kotlin. Hãy **copy sang project Flutter** thay vì tải lại (link asset của Figma hết hạn sau 7 ngày):

- **SVG (icon, minh hoạ):** `app/src/main/assets/svg/<màn hình>/<tên>.svg`. Thư mục con: `s01`…`s14`, `reg`, `conv`, `mempty`, `shop`, `cshop`, `flow`.
- **Ảnh PNG:** `app/src/main/res/drawable-nodpi/<màn hình>_<tên>.png` (avatar, ảnh quán, đồ uống, ảnh bài đăng, 3 ảnh glow của Splash…).
- **Font:** `app/src/main/res/font/inter.ttf`, `rubik.ttf`, `gabarito.ttf` (variable font, tải từ Google Fonts).
- **Code tham chiếu:** `app/src/main/java/com/example/zenzy/ui/design/`. Mỗi file chứa kích thước, màu, khoảng cách chính xác đã đối chiếu với Figma:
  - `Design.kt`: màu, font, text style, bóng đổ, bottom nav, cách scale.
  - `SplashLogin.kt`, `RegisterChat.kt` (Register, Conversation, Messages empty).
  - `MapNearby.kt` (Home Map, 3 màn Nearby), `Privacy.kt`.
  - `ShopEvent.kt`, `MyShop.kt` (My shop, Create shop).
  - `FeedChat.kt` (Newsfeed, Messages, Notifications), `ProfilePin.kt` (Profile, Create Live Pin).
  - `LivePinFlow.kt` (luồng live pin, Loading, Connection lost).
  - `ZenzyMap.kt` (bản đồ thật + nút định vị), `ZenzyApp.kt` (điều hướng).

Hãy đọc code Kotlin của từng màn hình rồi chuyển sang widget Flutter tương ứng. Chỉ gọi Figma (`get_design_context` / `get_screenshot`) khi cần đối chiếu lại.

## Quy ước thiết kế đã dùng (giữ nguyên trong Flutter)

- **Tỉ lệ:** mọi frame Figma rộng 402px. Scale toàn bộ UI sao cho chiều rộng màn hình = 402 đơn vị thiết kế, để dùng thẳng số px của Figma trên mọi điện thoại.
- **Màu chính:** navy `#1A1B2F`, coral `#FF5C5C`, canvas `#F8F9FC`, purple `#7C66DC`, lavender `#EAE8F8`, secondary `#6B7085`, line `#EBEFF5` / `#E9E9F1`.
- **Màu riêng của các frame luồng live pin và Messages empty:** ink `#1E254B`, indigo `#2F3C7E`, rose `#F96167`, slate `#6B7280`, mist `#9CA4BB`.
- **Font:** Inter cho các màn chính. Các frame luồng live pin và Messages empty dùng Rubik cho chữ thường và Gabarito cho tiêu đề. Line-height mặc định ≈ 1.21, tắt font padding, không cho cỡ chữ hệ thống ảnh hưởng.
- **SVG:** vẽ đúng file SVG gốc của Figma, không vẽ lại. Một số SVG dùng `mask`, `clipPath`, `use`; hãy kiểm tra thư viện SVG của Flutter vẽ đúng các file này, nếu không thì báo tôi.
- **Bóng đổ:** dùng đúng thông số drop shadow của Figma (màu có alpha, blur, offset Y).
- **Thanh trạng thái iOS ("9:41") và home indicator trong Figma:** không vẽ; thay bằng status bar / navigation bar thật của hệ điều hành (chừa safe area).
- **Bottom nav:** có 2 kiểu. Kiểu chính: Map · Feed · nút `+` · Chat · Profile. Kiểu của luồng live pin: Home · Feed · Message · Alerts · Profile, kèm nút `+` nổi. Nhiều frame Figma có một thanh nav thừa đè lên luôn tô sáng "Map"; hãy tô sáng đúng tab đang mở.
- **Form:** ô nhập là ô nhập thật với placeholder như thiết kế. Ở sheet Create Live Pin của luồng live pin, nút "Post to Map" chỉ bật khi đã có tiêu đề và mô tả (đó chính là 2 frame 02 và 03).
- **Màn 14 (Create Live Pin):** lớp phủ tối trên bản đồ dùng navy ~45% (Figma trả về màu đặc, đây là ước lượng theo ảnh render).

## Bản đồ

- Dùng **MapLibre** với tile **OpenFreeMap** style `https://tiles.openfreemap.org/styles/positron` (miễn phí, không cần key). Giữ nút attribution.
- Tâm bản đồ: Thảo Điền, TP.HCM (`10.8035, 106.7350`), zoom `15.2`. Tắt xoay/nghiêng, ẩn logo và la bàn.
- Áp dụng cho **Home Map (03)** và **bản đồ của luồng live pin**. Bản đồ nhỏ ở 3 màn Nearby vẫn là hình minh hoạ như Figma.
- **Pin:** đặt ban đầu đúng toạ độ màn hình trong Figma, sau đó gắn vào điểm địa lý tương ứng để pin di chuyển theo bản đồ khi kéo/zoom.
- **Nút định vị:** nút tròn trắng 44px ở góc phải, phía trên thẻ thông báo, icon `s04/locate_fixed.svg`. Bấm lần đầu thì xin quyền vị trí; sau đó hiện chấm vị trí và đưa camera về vị trí người dùng (zoom 16). Kéo bản đồ đi rồi bấm lại thì quay về.

## Điều hướng giữa các màn hình

- Splash → "Get Started" → Register; "I already have an account" → Login. Login/Register → Home Map.
- Bottom nav: Map → Home Map, Feed → Newsfeed, Chat → Messages, Profile → Profile, `+` → Create Live Pin (14).
- Home Map: pin cà phê/túi hoặc chip Shops → Shop; pin sự kiện, chip Events hoặc "Join" → Event; chip Friends hoặc nút filter → Nearby Loading.
- Nearby Loading → (chạm) Ghost Mode → "Turn off ghost mode" → Connection Error → "Retry connection" → Loading. Banner "You're offline" → Connection lost. Nút góc phải trên → Location Privacy.
- Event: "Message" → Conversation. Newsfeed: chuông → Notifications.
- Messages: dòng Zoe → Conversation; icon tìm kiếm → Messages empty → "Find friends nearby" → Nearby Loading. Conversation: "View on map" → Home Map.
- Profile: "Create shop" → Create shop → "Create shop" → My shop ("Edit shop" → Create shop); bánh răng → Location Privacy.
- Create Live Pin (14): "Post to Map" → bản đồ luồng live pin ở trạng thái "Your pin is live".
- Bản đồ luồng live pin: `+` mở sheet Create Live Pin; Post → pin live; Connection lost → "Retry Connection" → Loading → chạm → bản đồ.
- Nút back hệ thống quay lại màn trước.

## Cách làm việc tôi muốn

1. Trước khi viết, xem cấu trúc project Flutter hiện có và dùng đúng quy ước của nó.
2. Làm theo từng nhóm màn hình; mỗi nhóm xong thì build, chạy trên emulator, chụp màn hình và so với ảnh Figma (`get_screenshot`) rồi sửa lệch trước khi làm nhóm tiếp.
3. Thêm cách mở thẳng một màn hình bất kỳ khi chạy debug để tiện chụp so sánh.
4. Báo cáo trung thực: màn nào đã kiểm tra, màn nào chưa, chỗ nào khác Figma và vì sao.
5. Không commit, không push khi tôi chưa yêu cầu.

## Kết quả mong muốn

App Flutter chạy được trên Android, đủ 25 màn hình giống Figma, nối với nhau bằng các nút như mô tả, bản đồ thật có nút định vị, font và asset đóng gói sẵn; kèm danh sách ngắn những điểm còn khác thiết kế.
