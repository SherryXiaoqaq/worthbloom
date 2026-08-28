# WorthBloom 桌面花：零基础动手指南

这份方案先完成一个可靠的最小版本，再逐步增加灯光、震动和舵机。**第一次不要同时接所有零件，也先不要使用锂电池。**

## 先认识 5 个词

- **ESP32-S3**：花的“小脑袋”，负责联网、读按键和控制其他零件。
- **GPIO**：主控板上的信号脚。代码里的 `GPIO15` 就是在指定第 15 号信号脚。
- **5V / 3V3**：供电电压，不能凭感觉混接。舵机和大多数 WS2812 用 5V，ESP32 的信号是 3.3V。
- **GND**：电路共同的零点。不同电源共同工作时必须“共地”。
- **DIN**：灯环的数据输入脚，不能接到 DOUT。

## 第一阶段应该买什么

购买前先确认比赛是否会发开发板；如果会发，请把主板、屏幕背面型号和引脚文字拍给我，代码需要按实物适配。

如果完全从零购买，建议先买：

| 数量 | 名称 | 搜索词 / 要求 | 现在的用途 |
|---:|---|---|---|
| 1 | 微雪 ESP32-S3-Touch-LCD-1.28 | 必须是 `ESP32-S3-Touch-LCD-1.28`，不是只有屏幕的模块 | 主控、240×240 圆形彩屏、USB-C 都在一块板上 |
| 1 | USB-C 数据线 | 明确支持数据传输，不是“仅充电线” | 烧录程序和供电 |
| 1 | 5V 2A USB 电源 | 正规充电头或充电宝 | ESP32 与舵机稳定供电 |
| 1 | 简单支架 | 先用亚克力/积木/纸板，外壳后做 | 让屏幕立起来 |

这一阶段不需要焊接。官方资料确认该板使用 ESP32-S3、GC9A01A 圆屏，并已把屏幕接到主控上：[微雪官方硬件资料](https://www.waveshare.com/wiki/ESP32-S3-Touch-LCD-1.28)。

## 已经写好的程序在哪里

用 VS Code 打开这个文件夹：

```text
D:\黑客松\hardware\firmware
```

关键文件：

- `src/main.cpp`：程序入口、按键和 8 种演示状态。
- `src/flower_ui.cpp`：屏幕上的花、呼吸动画和进度环。
- `src/device_api.cpp`：Wi-Fi、读取网页状态、上报“今天使用了”。
- `src/actuators.cpp`：灯环、震动、舵机的可选控制。
- `include/app_config.h`：零件开关和引脚。
- `include/secrets.example.h`：联网配置模板；真实密码写到 `secrets.h`，它不会上传 GitHub。

屏幕第一版使用英文短句，因为 Arduino 默认字体不含中文字形；不影响中文网页和数据库。硬件稳定后再加入精选中文点阵字体，避免第一步被字体问题卡住。

## 第一次烧录：只测试屏幕

1. 安装 [VS Code](https://code.visualstudio.com/)。
2. 在 VS Code 左侧“扩展”搜索并安装 **PlatformIO IDE**，安装完成后重启 VS Code。
3. 选择“文件 → 打开文件夹”，打开 `D:\黑客松\hardware\firmware`。不要只打开单个 `.cpp` 文件。
4. 用 USB-C 数据线连接开发板和电脑。Windows 第一次识别串口可能要等几十秒。
5. 点击 VS Code 底部状态栏的 **✓** 编译。第一次会下载工具和库，时间较长是正常的。
6. 编译成功后，点击底部的 **→** 上传。
7. 若一直显示 `Connecting...`：按住板上 **BOOT**，短按一下 **RESET**，看到开始上传后松开 BOOT。
8. 上传完会自动运行；圆屏每 7 秒切换一种花，按 BOOT 也会切换。

应该依次看到：`SEED → WAITING → GROWING → BLOOM → HEALTHY → STRESSED → THIRSTY → RECOVERING`。

查看日志：点击 PlatformIO 的串口图标，波特率已经配置为 `115200`。如果 Windows 没有串口，请先换一条明确支持数据的 USB 线。

## 第二次烧录：让花读取本地网页

先保证电脑和 ESP32 连接同一个 Wi-Fi。校园网/公司网可能禁止设备互访，第一次建议用手机热点测试。

### 1. 让网页可被局域网访问

在项目根目录 `D:\黑客松` 打开 PowerShell：

```powershell
pnpm.cmd dev -- --hostname 0.0.0.0
```

另开一个 PowerShell，运行 `ipconfig`，找到当前 Wi-Fi 下的“IPv4 地址”，例如 `192.168.1.23`。手机用同一 Wi-Fi 打开 `http://192.168.1.23:3000` 验证；若打不开，需要在 Windows 防火墙中允许 Node.js 的专用网络访问。

### 2. 创建设备私密配置

在 `D:\黑客松\hardware\firmware` 运行：

```powershell
Copy-Item include\secrets.example.h include\secrets.h
notepad include\secrets.h
```

把其中内容改成：

```cpp
constexpr bool WB_ENABLE_NETWORK = true;
constexpr char WB_WIFI_SSID[] = "你的Wi-Fi名称";
constexpr char WB_WIFI_PASSWORD[] = "你的Wi-Fi密码";
constexpr char WB_API_BASE_URL[] = "http://192.168.1.23:3000";
constexpr char WB_DEVICE_ID[] = "flower_01";
constexpr char WB_DEVICE_SECRET[] = "worthbloom-local-device";
constexpr bool WB_ALLOW_INSECURE_TLS = false;
constexpr char WB_TLS_ROOT_CA[] = "";
```

IP 地址必须换成你的电脑地址；不能写 `localhost`，因为对 ESP32 来说，localhost 是它自己。重新编译和上传后，左上角应从 `LOCAL` 变成 `SYNC`。

本地演示有心愿、存钱和物资，所以屏幕会按优先级显示当前最需要陪伴的一项。网页点“今天使用了”后，花会短暂进入 `RECOVERING`。

## 上线并连接 CloudBase 后怎么配置

在 CloudBase Run 的网页服务环境变量中增加：

```text
DEVICE_ID=flower_01
DEVICE_OWNER_ID=主人在 CloudBase 身份认证中的用户 ID
DEVICE_SHARED_SECRET=一段至少32位的随机字符串
```

`DEVICE_OWNER_ID` 可在 CloudBase 控制台“身份认证 → 用户列表”找到。生成随机密钥可在 PowerShell 运行：

```powershell
[Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(32)).ToLower()
```

然后将固件 `secrets.h` 的地址换成 CloudBase Run 的完整 HTTPS 网址，并让 `WB_DEVICE_SECRET` 与环境变量完全相同。生产环境必须使用 HTTPS；最终量产固件应给 `WB_TLS_ROOT_CA` 放入网站证书对应的根证书。`WB_ALLOW_INSECURE_TLS=true` 只能作为短期展会测试，不应长期使用。

网页已经提供两个设备接口：

- `GET /api/device/state?device_id=flower_01`：设备每 5 秒读取一次花的状态。
- `POST /api/device/action`：按键上报 `USED_TODAY`；重复事件 ID 不会重复计数。

设备接口只返回标题、状态、进度和物资 ID，不会把朋友昵称、留言或主人账户资料发给硬件。
如果 Wi-Fi 短暂断开，固件会在内存里保留一条待上报操作，恢复联网后用同一事件 ID 重试；服务器会去重。原型阶段不要在离线时连续按很多次，断电也会清空这条内存队列。

## 已移除的扩展硬件

当前版本只保留 ESP32 主控、屏幕和舵机。灯环、振动马达及其驱动/电平转换器已从固件和依赖中移除，不需要购买或接线。

历史方案曾考虑过灯环，以下内容仅作记录，不属于当前接线步骤：

| 数量 | 零件 | 要求 |
|---:|---|---|
| 1 | WS2812B 灯环 | 8 灯或 12 灯、5V、带 `DIN` 标记 |
| 1 | 74AHCT125 电平转换模块 | 把 ESP32 的 3.3V 数据可靠转换为 5V |
| 1 | 330Ω 电阻 | 串在转换器输出和灯环 DIN 之间 |
| 1 | 1000µF 电解电容 | 耐压至少 6.3V，跨接灯环 5V 与 GND |
| 若干 | 杜邦线/面包板 | 原型连接；正式作品改焊接 |

推荐接法：

```text
ESP32 GPIO15 → 74AHCT125 输入 → 74AHCT125 输出 → 330Ω → 灯环 DIN
外部 5V       → 74AHCT125 VCC、灯环 5V
外部 GND      → 74AHCT125 GND、灯环 GND、ESP32 GND（共地）
1000µF 电容   → 灯环 5V 与 GND（注意正负极）
```

当前固件不再编译 NeoPixel，也不会控制 GPIO15。

8 颗灯按最坏 60mA/颗估算可接近 0.48A，不能从普通 GPIO 取电。当前代码还把最大亮度限制在 72/255，但供电仍应留足余量。

## 已移除：震动马达

当前版本不再使用震动马达，也不需要 GPIO4 或 MOSFET 焊盘。

这块微雪主板还提供由 GPIO4 控制的 MOSFET 焊盘，但只有确认马达额定电压、电流和焊盘供电路径后再用。接线确认后，把 `#define WB_ENABLE_VIBRATION 0` 改成 `1`。花在 `BLOOM`、`WAITING`、`RECOVERING` 切换时会给出不同长度的轻震。

## 当前唯一扩展硬件：一只舵机

建议只买 1 个 SG90（5V）先做花瓣抬头/低头，不要一开始做多舵机。

```text
ESP32 GPIO16  → SG90 信号线（通常橙/黄）
独立 5V       → SG90 红线
独立 GND      → SG90 棕/黑线
ESP32 GND     → 同一个独立 GND（共地）
```

**舵机不能从 ESP32 的 3V3 引脚供电。** 舵机启动电流会让主控重启，应使用独立、稳定的 5V 电源，先断电接线。接好后把 `#define WB_ENABLE_SERVO 0` 改成 `1`。程序会让健康/盛开状态抬头，缺水/压力状态低头。

心愿进度的传递链路是：网页在“电子花”中选中心愿 → 服务端保存该心愿 ID → ESP32 每 5 秒请求一次 `/api/device/state` → 接口返回 `progress: 0.0～1.0` → 舵机按同一比例转动。例如网页进度 60%，固件收到 `0.6`，默认角度约为 `30 + 0.6 × (145 - 30) = 99°`。

机械结构装好后，用 `include/app_config.h` 中的两个值限制安全行程：

```cpp
constexpr int WB_SERVO_CLOSED_ANGLE = 30;
constexpr int WB_SERVO_OPEN_ANGLE = 145;
```

先拆下花瓣连杆测试舵机，再逐步缩小或调整角度；不要让舵机持续顶住机械限位。

## 安全顺序

1. 接线前拔掉 USB 和外部电源。
2. 先核对 5V、3V3、GND，再核对信号脚。
3. 多个电源共同控制信号时必须共地。
4. 裸马达和舵机都不能直接由 GPIO 或 3V3 供电。
5. 电解电容有正负极，反接可能损坏。
6. 第一版全程 USB 供电；锂电池、充电与便携化等外壳定型后再做。

## 每一关的验收标准

- 屏幕关：连续运行 30 分钟，不白屏、不重启，按键每次只切换一次。
- 联网关：断开 Wi-Fi 后不死机，恢复 Wi-Fi 后 20 秒内重新出现 `SYNC`。
- 数据关：网页存钱时显示 `GROWING`；完成后短暂 `BLOOM`；按键记录使用后短暂 `RECOVERING`。
- 灯光关：不闪烁、不让主控重启，电源线和灯环不过热。
- 机械关：舵机动作不夹线、不顶死，运动范围限制在外壳允许角度内。

## 常见故障

- **编译找不到库**：确认打开的是 `hardware/firmware` 整个文件夹，等待 PlatformIO 首次下载完成。
- **找不到 COM 口**：换数据线/USB 口，拔插后重启 VS Code。
- **上传卡在 Connecting**：使用 BOOT + RESET 的进入下载模式步骤。
- **屏幕亮但没图**：确认买到的完整型号与本指南一致；拍正反面和包装型号。
- **一直 LOCAL**：检查 Wi-Fi 名称密码、电脑 IP、同一网络、防火墙，以及 API 地址没有写 localhost。
- **加灯或舵机后反复重启**：首先断开新零件，通常是供电不足、未共地或接错电压。

先只完成“第一次烧录”。看到 8 种花后，再做联网；每次只加一个变量，定位问题会非常容易。
