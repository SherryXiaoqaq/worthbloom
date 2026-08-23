#include "actuators.h"

#include <math.h>
#include "app_config.h"

#if WB_ENABLE_NEOPIXEL
#include <Adafruit_NeoPixel.h>
namespace { Adafruit_NeoPixel pixels(WB_NEOPIXEL_COUNT, WB_NEOPIXEL_PIN, NEO_GRB + NEO_KHZ800); }
#endif

namespace {
void modeRgb(FlowerMode mode, uint8_t& red, uint8_t& green, uint8_t& blue) {
  red = 104; green = 126; blue = 96;
  if (mode == FlowerMode::WAITING) { red = 124; green = 82; blue = 104; }
  if (mode == FlowerMode::GROWING || mode == FlowerMode::BLOOM) { red = 235; green = 151; blue = 119; }
  if (mode == FlowerMode::STRESSED || mode == FlowerMode::THIRSTY) { red = 130; green = 94; blue = 67; }
  if (mode == FlowerMode::RECOVERING) { red = 115; green = 149; blue = 105; }
}

int modeAngle(const DeviceState& state) {
  if (state.mode == FlowerMode::BLOOM) return 145;
  if (state.mode == FlowerMode::HEALTHY) return 112;
  if (state.mode == FlowerMode::RECOVERING) return 92;
  if (state.mode == FlowerMode::GROWING) return 58 + static_cast<int>(state.progress * 45.0f);
  if (state.mode == FlowerMode::WAITING) return 62;
  if (state.mode == FlowerMode::STRESSED || state.mode == FlowerMode::THIRSTY) return 34;
  return 45;
}
}

void Actuators::begin() {
#if WB_ENABLE_NEOPIXEL
  pixels.begin();
  pixels.clear();
  pixels.setBrightness(WB_NEOPIXEL_MAX_BRIGHTNESS);
  pixels.show();
#endif

  if (WB_ENABLE_VIBRATION) {
    pinMode(WB_VIBRATION_PIN, OUTPUT);
    digitalWrite(WB_VIBRATION_PIN, LOW);
  }

  if (WB_ENABLE_SERVO) {
    ledcSetup(WB_SERVO_CHANNEL, 50, 16);
    ledcAttachPin(WB_SERVO_PIN, WB_SERVO_CHANNEL);
    setServoAngle(45);
  }
}

void Actuators::setServoAngle(int angle) {
  if (!WB_ENABLE_SERVO) return;
  angle = constrain(angle, 0, 180);
  const uint32_t pulseUs = map(angle, 0, 180, 550, 2350);
  const uint32_t duty = pulseUs * 65535UL / 20000UL;
  ledcWrite(WB_SERVO_CHANNEL, duty);
}

void Actuators::onModeChanged(FlowerMode mode, unsigned long now) {
  lastMode_ = mode;
  if (!WB_ENABLE_VIBRATION) return;
  if (mode == FlowerMode::BLOOM) vibrationEndsAt_ = now + 260;
  else if (mode == FlowerMode::WAITING || mode == FlowerMode::RECOVERING) vibrationEndsAt_ = now + 90;
}

void Actuators::update(const DeviceState& state, unsigned long now) {
  if (state.mode != lastMode_) onModeChanged(state.mode, now);

#if WB_ENABLE_NEOPIXEL
  uint8_t red = 0, green = 0, blue = 0;
  modeRgb(state.mode, red, green, blue);
  const float breath = 0.34f + (sin(now / 720.0f) + 1.0f) * 0.22f;
  const float intensity = state.mode == FlowerMode::HEALTHY ? 0.62f : breath;
  for (int index = 0; index < WB_NEOPIXEL_COUNT; ++index) {
    const bool growingOn = state.mode != FlowerMode::GROWING || index < static_cast<int>(ceil(state.progress * WB_NEOPIXEL_COUNT));
    pixels.setPixelColor(index, growingOn ? pixels.Color(red * intensity, green * intensity, blue * intensity) : 0);
  }
  pixels.show();
#endif

  if (WB_ENABLE_VIBRATION) digitalWrite(WB_VIBRATION_PIN, now < vibrationEndsAt_ ? HIGH : LOW);
  if (WB_ENABLE_SERVO) setServoAngle(modeAngle(state));
}
