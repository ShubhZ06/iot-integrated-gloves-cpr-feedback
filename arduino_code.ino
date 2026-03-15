#include <Adafruit_MPU6050.h>
#include <Adafruit_Sensor.h>
#include <Wire.h>

Adafruit_MPU6050 mpu;

// =============================================================
//   CPR FEEDBACK GLOVES - JSON Serial Output
//   Right Glove: FSR (Force) raw output
//   Left Glove : MPU6050 (Wrist angle & Experimental Depth)
// =============================================================

const int FSR_PIN = A0;
const int GREEN_LED = 2;
const int RED_LED = 3;

// --- AHA STANDARDS ---
const float MAX_WRIST_TILT = 15.0;
const int MIN_BPM = 100;
const int MAX_BPM = 120;

// --- SENSOR BASELINES ---
float baselineAngleY = 0.0;
float baselineAccelZ = 0.0; // To subtract gravity

// --- DEPTH CALCULATION (EXPERIMENTAL) ---
float velocityZ = 0.0;
float positionZ = 0.0;
float maxDepthCycle = 0.0; // Tracks max depth per compression
unsigned long lastMpuTime = 0;

// --- SESSION TRACKING ---
unsigned long sessionStart = 0;
int totalCompressions = 0;
int goodCompressions = 0;

// --- INTERNAL STATE ---
bool inCompression = false;
unsigned long lastPressTime = 0;
float currentBPM = 0;
unsigned long compressionTimes[10];
int compressionIdx = 0;

unsigned long lastPrintTime = 0;
const int PRINT_INTERVAL_MS = 200;

void setup() {
  Serial.begin(9600);
  Wire.begin();

  pinMode(GREEN_LED, OUTPUT);
  pinMode(RED_LED, OUTPUT);

  Wire.beginTransmission(0x68);
  Wire.write(0x6B);
  Wire.write(0);
  Wire.endTransmission();
  delay(100);

  if (!mpu.begin(0x68)) {
    Serial.println("{\"error\":\"MPU6050 not found\"}");
  }

  mpu.setAccelerometerRange(
      MPU6050_RANGE_4_G); // Increased range for hard compressions
  mpu.setGyroRange(MPU6050_RANGE_250_DEG);
  mpu.setFilterBandwidth(MPU6050_BAND_21_HZ);

  // Calibrate baselines (hold flat and still)
  delay(2000);
  float angleSum = 0;
  float accelZSum = 0;
  for (int i = 0; i < 50; i++) {
    sensors_event_t a, g, temp;
    mpu.getEvent(&a, &g, &temp);
    angleSum += atan2(a.acceleration.y, a.acceleration.z) * 180.0 / PI;
    accelZSum += a.acceleration.z;
    delay(20);
  }
  baselineAngleY = angleSum / 50.0;
  baselineAccelZ = accelZSum / 50.0; // Expected to be ~9.8 m/s^2 if flat

  sessionStart = millis();
  lastMpuTime = micros();
  Serial.println("{\"status\":\"ready\"}");
}

float calculateBPM() {
  if (totalCompressions < 2)
    return 0;
  int n = min(totalCompressions, 10);
  int oldest = (compressionIdx - n + 10) % 10;
  int newest = (compressionIdx - 1 + 10) % 10;
  unsigned long elapsed = compressionTimes[newest] - compressionTimes[oldest];
  if (elapsed == 0)
    return 0;
  return (n - 1) / (elapsed / 60000.0);
}

void loop() {
  unsigned long nowMillis = millis();
  unsigned long nowMicros = micros();

  // Time delta in seconds for integration
  float dt = (nowMicros - lastMpuTime) / 1000000.0;
  lastMpuTime = nowMicros;

  // 1. Read FSR (Raw, no threshold)
  int forceValue = analogRead(FSR_PIN);

  // 2. Read MPU6050
  sensors_event_t a, g, temp;
  mpu.getEvent(&a, &g, &temp);

  // Angle check
  float angleY = atan2(a.acceleration.y, a.acceleration.z) * 180.0 / PI;
  float angleDev = abs(angleY - baselineAngleY);
  bool isAngleGood = (angleDev <= MAX_WRIST_TILT);

  // 3. Calculate Depth via Double Integration
  // Remove gravity baseline to get linear acceleration
  float linearAccelZ = a.acceleration.z - baselineAccelZ;

  // Integrate Accel -> Velocity -> Position (Depth)
  // We use a "leaky" factor (0.92) to constantly pull it back to zero to fight
  // drift
  velocityZ = (velocityZ + (linearAccelZ * dt)) * 0.92;
  positionZ = (positionZ + (velocityZ * dt)) * 0.92;

  // Convert position to cm (very rough estimation)
  float depthCm = positionZ * 100.0;
  if (abs(depthCm) > maxDepthCycle) {
    maxDepthCycle = abs(depthCm);
  }

  // 4. Detect Compressions using Velocity instead of FSR threshold
  // If moving down fast, we are compressing.
  if (!inCompression && velocityZ < -0.1) {
    inCompression = true;
    lastPressTime = nowMillis;
  }
  // If moving up, compression is released
  else if (inCompression && velocityZ > 0.05) {
    inCompression = false;
    totalCompressions++;
    compressionTimes[compressionIdx % 10] = lastPressTime;
    compressionIdx++;

    if (isAngleGood)
      goodCompressions++;
    currentBPM = calculateBPM();

    // Reset max depth tracker for the next cycle
    maxDepthCycle = 0.0;
  }

  // 5. LED feedback (Angle and Rate)
  bool isBpmGood = (currentBPM >= MIN_BPM && currentBPM <= MAX_BPM);
  if (isAngleGood && (totalCompressions < 2 || isBpmGood)) {
    digitalWrite(GREEN_LED, HIGH);
    digitalWrite(RED_LED, LOW);
  } else {
    digitalWrite(GREEN_LED, LOW);
    digitalWrite(RED_LED, HIGH);
  }

  // 6. JSON output
  if (nowMillis - lastPrintTime >= PRINT_INTERVAL_MS) {
    lastPrintTime = nowMillis;
    int goodPct = (totalCompressions > 0)
                      ? (goodCompressions * 100 / totalCompressions)
                      : 0;

    Serial.print("{");
    Serial.print("\"forceRaw\":");
    Serial.print(forceValue);
    Serial.print(",\"angleDev\":");
    Serial.print(angleDev, 1);
    Serial.print(",\"depthCm\":");
    Serial.print(abs(depthCm), 2);
    Serial.print(",\"bpm\":");
    Serial.print(currentBPM, 1);
    Serial.print(",\"compressions\":");
    Serial.print(totalCompressions);
    Serial.print(",\"goodPct\":");
    Serial.print(goodPct);
    Serial.println("}");
  }
}