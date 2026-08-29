#include "flower_ui.h"

#include <Arduino_GFX_Library.h>
#include <math.h>

#include "app_config.h"

namespace {
Arduino_DataBus* bus = new Arduino_ESP32SPI(
    WB_LCD_DC, WB_LCD_CS, WB_LCD_SCK, WB_LCD_MOSI, WB_LCD_MISO);
Arduino_GFX* gfx = new Arduino_GC9A01(bus, WB_LCD_RESET, 0, true);

constexpr uint16_t PAPER = 0xF6F2;
constexpr uint16_t INK = 0x2145;
constexpr uint16_t MUTED = 0x7BCF;
constexpr uint16_t SAGE = 0x6C0D;
constexpr uint16_t PLUM = 0x7AAB;
constexpr uint16_t PEACH = 0xE4EB;
constexpr uint16_t GOLD = 0xD5C8;
constexpr uint16_t DRY = 0x9B08;
constexpr uint16_t WHITE = 0xFFFF;
}

bool FlowerUi::begin() {
  pinMode(WB_LCD_BACKLIGHT, OUTPUT);
  digitalWrite(WB_LCD_BACKLIGHT, HIGH);
  if (!gfx->begin(40000000)) return false;
  gfx->fillScreen(PAPER);
  return true;
}

uint16_t FlowerUi::stateColor(FlowerMode mode) const {
  switch (mode) {
    case FlowerMode::SEED: return GOLD;
    case FlowerMode::WAITING: return PLUM;
    case FlowerMode::GROWING: return PEACH;
    case FlowerMode::BLOOM: return PEACH;
    case FlowerMode::HEALTHY: return SAGE;
    case FlowerMode::STRESSED: return DRY;
    case FlowerMode::THIRSTY: return DRY;
    case FlowerMode::RECOVERING: return SAGE;
  }
  return SAGE;
}

void FlowerUi::centeredText(const String& text, int y, uint8_t size, uint16_t color) {
  int16_t x1 = 0;
  int16_t y1 = 0;
  uint16_t width = 0;
  uint16_t height = 0;
  gfx->setTextSize(size);
  gfx->setTextColor(color);
  gfx->getTextBounds(text.c_str(), 0, y, &x1, &y1, &width, &height);
  gfx->setCursor(max(8, (240 - static_cast<int>(width)) / 2), y);
  gfx->print(text);
}

void FlowerUi::drawProgress(float progress, uint16_t color) {
  progress = constrain(progress, 0.0f, 1.0f);
  const int marks = static_cast<int>(progress * 72.0f);
  for (int index = 0; index < 72; ++index) {
    const float angle = (-90.0f + index * 5.0f) * PI / 180.0f;
    const int x1 = 120 + cos(angle) * 108;
    const int y1 = 120 + sin(angle) * 108;
    const int x2 = 120 + cos(angle) * 113;
    const int y2 = 120 + sin(angle) * 113;
    gfx->drawLine(x1, y1, x2, y2, index < marks ? color : 0xDEFB);
  }
}

void FlowerUi::drawFlower(const DeviceState& state, unsigned long now, uint16_t accent) {
  const float breath = (sin(now / 650.0f) + 1.0f) * 0.5f;
  const bool lowered = state.mode == FlowerMode::STRESSED || state.mode == FlowerMode::THIRSTY;
  const int centerX = 120;
  const int centerY = lowered ? 130 : 116;
  const int stemTop = centerY + 18;

  gfx->drawLine(centerX, stemTop, centerX, 184, SAGE);
  gfx->drawLine(centerX + 1, stemTop, centerX + 1, 184, SAGE);
  gfx->fillCircle(centerX - 11, 164, 9, SAGE);
  gfx->fillCircle(centerX + 11, 174, 8, SAGE);

  if (state.mode == FlowerMode::SEED) {
    gfx->fillCircle(centerX, 181, 8, accent);
    gfx->fillCircle(centerX, 179, 4, GOLD);
    return;
  }

  int petals = 2;
  if (state.mode == FlowerMode::GROWING) petals = 2 + static_cast<int>(state.progress * 4.0f);
  if (state.mode == FlowerMode::BLOOM || state.mode == FlowerMode::HEALTHY || state.mode == FlowerMode::RECOVERING) petals = 6;
  if (state.mode == FlowerMode::STRESSED || state.mode == FlowerMode::THIRSTY) petals = 4;
  const int radius = 23 + ((state.mode == FlowerMode::WAITING || state.mode == FlowerMode::BLOOM) ? static_cast<int>(breath * 3) : 0);
  const int petalRadius = state.mode == FlowerMode::BLOOM ? 17 : 14;

  for (int index = 0; index < petals; ++index) {
    const float angle = (-90.0f + index * (360.0f / max(1, petals))) * PI / 180.0f;
    const int x = centerX + cos(angle) * radius;
    const int y = centerY + sin(angle) * radius;
    gfx->fillCircle(x, y, petalRadius, accent);
  }
  gfx->fillCircle(centerX, centerY, 16, GOLD);
  gfx->fillCircle(centerX - 4, centerY - 5, 4, 0xF6CE);
}

void FlowerUi::render(const DeviceState& state, unsigned long now, bool bleConnected) {
  const uint16_t accent = stateColor(state.mode);
  gfx->fillScreen(PAPER);
  drawProgress(state.progress, accent);

  gfx->fillCircle(30, 30, 4, bleConnected ? SAGE : MUTED);
  gfx->setTextSize(1);
  gfx->setTextColor(MUTED);
  gfx->setCursor(40, 27);
  gfx->print(bleConnected ? "BLE" : "ADVERTISE");

  centeredText(flowerModeName(state.mode), 31, 2, INK);
  drawFlower(state, now, accent);

  String footer = state.message;
  if (footer.length() > 24) footer = footer.substring(0, 24);
  centeredText(footer, 198, 1, MUTED);

  String status = String(static_cast<int>(state.progress * 100.0f)) + "%  |  health " + String(state.health);
  centeredText(status, 214, 1, INK);
}
