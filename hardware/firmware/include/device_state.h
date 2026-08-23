#pragma once

#include <Arduino.h>

enum class FlowerMode {
  SEED,
  WAITING,
  GROWING,
  BLOOM,
  HEALTHY,
  STRESSED,
  THIRSTY,
  RECOVERING,
};

struct DeviceState {
  FlowerMode mode = FlowerMode::SEED;
  String title = "A new wish";
  String message = "Plant a wish";
  String assetId;
  float progress = 0.0f;
  int health = 80;
};

inline const char* flowerModeName(FlowerMode mode) {
  switch (mode) {
    case FlowerMode::SEED: return "SEED";
    case FlowerMode::WAITING: return "WAITING";
    case FlowerMode::GROWING: return "GROWING";
    case FlowerMode::BLOOM: return "BLOOM";
    case FlowerMode::HEALTHY: return "HEALTHY";
    case FlowerMode::STRESSED: return "STRESSED";
    case FlowerMode::THIRSTY: return "THIRSTY";
    case FlowerMode::RECOVERING: return "RECOVERING";
  }
  return "SEED";
}

inline FlowerMode flowerModeFromString(const String& value) {
  if (value == "WAITING") return FlowerMode::WAITING;
  if (value == "GROWING") return FlowerMode::GROWING;
  if (value == "BLOOM") return FlowerMode::BLOOM;
  if (value == "HEALTHY") return FlowerMode::HEALTHY;
  if (value == "STRESSED") return FlowerMode::STRESSED;
  if (value == "THIRSTY") return FlowerMode::THIRSTY;
  if (value == "RECOVERING") return FlowerMode::RECOVERING;
  return FlowerMode::SEED;
}
