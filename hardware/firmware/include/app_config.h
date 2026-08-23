#pragma once

// WorthBloom reference board:
// Waveshare ESP32-S3-Touch-LCD-1.28 (GC9A01A, 240x240)

// Onboard display pins from the Waveshare schematic.
constexpr int WB_LCD_BACKLIGHT = 2;
constexpr int WB_LCD_DC = 8;
constexpr int WB_LCD_CS = 9;
constexpr int WB_LCD_SCK = 10;
constexpr int WB_LCD_MOSI = 11;
constexpr int WB_LCD_MISO = 12;
constexpr int WB_LCD_RESET = 14;

// The onboard BOOT key is also a normal active-low button after startup.
constexpr int WB_ACTION_BUTTON = 0;

// Optional expansion pins. Leave every feature disabled for the first boot.
#define WB_ENABLE_NEOPIXEL 0
constexpr int WB_NEOPIXEL_PIN = 15;
constexpr int WB_NEOPIXEL_COUNT = 8;
constexpr int WB_NEOPIXEL_MAX_BRIGHTNESS = 72;

#define WB_ENABLE_SERVO 0
constexpr int WB_SERVO_PIN = 16;
constexpr int WB_SERVO_CHANNEL = 7;

// GPIO4 controls the board's MOSFET1 solder pads. Do not connect a bare motor
// directly to a GPIO. Keep disabled until the motor wiring step is complete.
#define WB_ENABLE_VIBRATION 0
constexpr int WB_VIBRATION_PIN = 4;

constexpr unsigned long WB_RENDER_INTERVAL_MS = 45;
constexpr unsigned long WB_MOCK_STATE_INTERVAL_MS = 7000;
constexpr unsigned long WB_API_POLL_INTERVAL_MS = 5000;
constexpr unsigned long WB_WIFI_RETRY_INTERVAL_MS = 10000;
