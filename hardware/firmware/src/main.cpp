#include <Arduino.h>

#include <BLE2902.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>

#include "actuators.h"
#include "app_config.h"
#include "device_state.h"
#include "flower_ui.h"

namespace {
FlowerUi ui;
Actuators actuators;
DeviceState state = {
    FlowerMode::WAITING,
    "HaoHaoHua",
    "Waiting for phone",
    "",
    0.0f,
    80,
};

BLECharacteristic* commandCharacteristic = nullptr;
volatile int targetPercent = -1;
volatile bool phoneConnected = false;

class ServerCallbacks final : public BLEServerCallbacks {
 public:
  void onConnect(BLEServer* server) override {
    (void)server;
    phoneConnected = true;
    Serial.println("Phone connected over BLE");
  }

  void onDisconnect(BLEServer* server) override {
    (void)server;
    phoneConnected = false;
    Serial.println("Phone disconnected from BLE");
    BLEDevice::startAdvertising();
  }
};

class CommandCallbacks final : public BLECharacteristicCallbacks {
 public:
  void onWrite(BLECharacteristic* characteristic) override {
    String value = characteristic->getValue();
    if (value.length() == 0) return;

    Serial.print("Received BLE command: ");
    Serial.println(value);
    value.trim();
    value.toLowerCase();

    if (value == "full") {
      targetPercent = 100;
      return;
    }

    bool isNumber = true;
    for (int index = 0; index < value.length(); ++index) {
      if (!isDigit(value[index])) {
        isNumber = false;
        break;
      }
    }
    if (!isNumber) {
      Serial.println("Ignored BLE command: expected a number from 0 to 100");
      return;
    }

    targetPercent = constrain(value.toInt(), 0, 100);
  }
};

void beginBluetooth() {
  BLEDevice::init(WB_BLE_DEVICE_NAME);
  BLEServer* server = BLEDevice::createServer();
  server->setCallbacks(new ServerCallbacks());

  BLEService* service = server->createService(WB_BLE_SERVICE_UUID);
  commandCharacteristic = service->createCharacteristic(
      WB_BLE_COMMAND_CHARACTERISTIC_UUID,
      BLECharacteristic::PROPERTY_WRITE | BLECharacteristic::PROPERTY_WRITE_NR);
  commandCharacteristic->addDescriptor(new BLE2902());
  commandCharacteristic->setCallbacks(new CommandCallbacks());
  service->start();

  BLEAdvertising* advertising = BLEDevice::getAdvertising();
  advertising->addServiceUUID(WB_BLE_SERVICE_UUID);
  advertising->setScanResponse(true);
  advertising->setMinPreferred(0x06);
  advertising->setMinPreferred(0x12);
  BLEDevice::startAdvertising();
  Serial.printf("BLE advertising as %s\n", WB_BLE_DEVICE_NAME);
}

void applyProgressCommand(int percent, unsigned long now) {
  percent = constrain(percent, 0, 100);
  state.progress = static_cast<float>(percent) / 100.0f;
  state.mode = percent >= 100 ? FlowerMode::BLOOM : FlowerMode::GROWING;
  state.message = String(percent) + "% from phone";
  state.health = percent >= 100 ? 100 : 80;
  actuators.setProgress(percent, now);
  Serial.printf("Progress set to %d%%\n", percent);
}
}

void setup() {
  Serial.begin(115200);
  delay(250);
  Serial.println("\nWorthBloom flower starting in BLE mode...");

  if (!ui.begin()) {
    Serial.println("Display init failed. Check that the selected board is ESP32-S3.");
  }
  actuators.begin();
  beginBluetooth();
  actuators.onModeChanged(state.mode, millis());
}

void loop() {
  const unsigned long now = millis();
  const int nextPercent = targetPercent;
  if (nextPercent >= 0) {
    targetPercent = -1;
    applyProgressCommand(nextPercent, now);
  }

  actuators.update(state, now);
  static unsigned long lastRenderAt = 0;
  if (now - lastRenderAt >= WB_RENDER_INTERVAL_MS) {
    lastRenderAt = now;
    ui.render(state, now, phoneConnected);
  }
  delay(2);
}
