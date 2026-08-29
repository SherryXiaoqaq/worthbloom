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

// BLE and servo configuration for the HaoHaoHua flower.
constexpr char WB_BLE_DEVICE_NAME[] = "HaoHaoHua";
constexpr char WB_BLE_SERVICE_UUID[] = "4fafc201-1fb5-459e-8fcc-c5c9c331914b";
constexpr char WB_BLE_COMMAND_CHARACTERISTIC_UUID[] = "beb5483e-36e1-4688-b7f5-ea07361b26a8";

#define WB_ENABLE_SERVO 1
constexpr int WB_SERVO_PIN = 13;
constexpr int WB_SERVO_CHANNEL = 7;
constexpr int WB_SERVO_PWM_FREQUENCY = 50;
constexpr int WB_SERVO_PWM_RESOLUTION = 14;
constexpr int WB_SERVO_OPEN_ANGLE = 0;
constexpr int WB_SERVO_CLOSED_ANGLE = 180;
constexpr int WB_SERVO_DUTY_AT_OPEN = 410;
constexpr int WB_SERVO_DUTY_AT_CLOSED = 2048;
constexpr unsigned long WB_SERVO_ROTATE_TIME_MS = 3000;

constexpr unsigned long WB_RENDER_INTERVAL_MS = 45;
