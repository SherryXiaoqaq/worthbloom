# WorthBloom 桌面花：BLE 蓝牙版

当前固件只使用 BLE 蓝牙和 SG90 舵机，不再使用 Wi‑Fi、HTTP、CloudBase 或设备 API 轮询。

## 数据链路

```text
Android Chrome 网页
  → Web Bluetooth
  → HaoHaoHua
  → 4fafc201-1fb5-459e-8fcc-c5c9c331914b
  → beb5483e-36e1-4688-b7f5-ea07361b26a8
  → 纯数字字符串，例如 "50"
  → ESP32-S3
  → SG90 舵机
```

## 固件位置

用 VS Code / PlatformIO 打开：

```text
D:\黑客松\hardware\firmware
```

关键文件：

- `src/main.cpp`：BLE 广播、手机连接回调、数字指令解析和进度状态。
- `src/actuators.cpp`：按 0～100% 平滑移动 SG90 舵机。
- `src/flower_ui.cpp`：圆屏花朵和 BLE 状态显示。
- `include/app_config.h`：设备名、UUID、舵机引脚和角度配置。

`src/device_api.cpp`、`src/device_api.h` 和联网配置已移除；固件不会连接 Wi‑Fi，也不会请求网页接口。

## 烧录与测试

1. 安装 VS Code 和 PlatformIO IDE。
2. 用 USB-C 数据线连接 ESP32-S3。
3. 打开 `hardware/firmware` 文件夹。
4. 点击 PlatformIO 的编译和上传按钮。
5. 打开串口监视器，波特率为 `115200`。
6. 启动后应看到：`BLE advertising as HaoHaoHua`。
7. 舵机信号线接 GPIO13；舵机使用独立稳定的 5V 电源，电源 GND 与 ESP32 GND 共地。

## 手机操作

1. 使用 Android 手机和 Chrome。
2. 打开 `https://` 开头的网页链接。
3. 进入“电子花”页面，点击“连接设备”。
4. 选择 `HaoHaoHua`。
5. 输入 `0～100` 的整数，例如 `50`。
6. 点击“提交 / 发送”。

网页写入的是纯数字字符串：`"0"`、`"50"`、`"100"`。ESP32 收到后会限制到 0～100，并在约 3 秒内转到目标角度。

## 舵机角度

当前按队友代码配置：

- `0%` → `CLOSE_ANGLE = 180°`
- `100%` → `OPEN_ANGLE = 0°`
- GPIO13，50Hz，14 位 PWM
- 开合动作耗时约 3 秒

如果机械方向相反，只需在 `include/app_config.h` 交换 `WB_SERVO_OPEN_ANGLE` 和 `WB_SERVO_CLOSED_ANGLE`，不要修改网页端数据格式。

## 注意事项

- Web Bluetooth 通常需要 Android Chrome；iPhone Safari 不适合作为测试端。
- 网页必须使用 HTTPS；`localhost` 仅适合电脑本机开发调试。
- ESP32 必须正在广播，手机蓝牙弹窗中才能看到 `HaoHaoHua`。
- 舵机不要由 ESP32 的 3V3 引脚供电；启动电流可能导致重启。
- 当前 BLE 写入特性使用 `WRITE` 和 `WRITE_NR`，可兼容网页的 `writeValueWithResponse` / `writeValue`。
