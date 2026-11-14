import { config } from './common/config.js';

/** In ra URL kiểm tra tình trạng rồi gọi nó; mã thoát 0 = server khoẻ. Dùng cho Docker HEALTHCHECK và `npm run health`. */
console.log(config.healthUrl);
fetch(config.healthUrl)
  .then(async (res) => {
    console.log(res.status, await res.text());
    process.exit(res.ok ? 0 : 1);
  })
  .catch((error) => {
    console.error(String(error));
    process.exit(1);
  });
