#define kMaxNumObjects (4)
#define kValueChangeThresh (0.04)
#define kNoObjectThresh (0.04)
#define kMatchNumSamples (4)

enum {
  kNoChange = -3,
  kNoMatch = -2,
  kNoObject = -1
};

class ObjectDetector {

  // Object detector config type
  typedef struct od_config_t {
      char valid[8];
      float weights[kMaxNumObjects];
      float tolerances[kMaxNumObjects];
      float offset;
      od_config_t() {
        for (int i = 0; i < kMaxNumObjects; i++) {
          weights[i] = 0;
          tolerances[i] = 0;
        }
        offset = 0.0;
      }
  } od_config_t;
  
public:

  ObjectDetector(int eeprom_addr) : eeprom_addr(eeprom_addr), 
  object(kNoObject), object_ctr(0), previous(0), odconfig(od_config_t()) {}
  
  ~ObjectDetector() {};

  // Set the weight and tolerance of an object
  void set_object(int idx, float weight, float tolerance) {
    if (idx >= 0 && idx < kMaxNumObjects) {
      odconfig.weights[idx] = weight;
      odconfig.tolerances[idx] = tolerance;
    }
  }

  /* If value has changed, check to see if it's within the tolerance of
   *  any objects. */
  int process(float val) {

    if (!odconfig.valid)
      return kNoChange;
    
    // Case 1: No significant change in value
    if (fabs(val - previous) < kValueChangeThresh) {
      
      // An object was previously matched
      if (object >= 0) {
        object_ctr++;
        if (object_ctr < kMatchNumSamples)
          return kNoChange;
        // Case 6: Matched object
        else {
          object_ctr = 0;
          return object;
        }
      }
      return kNoChange;
    }
    // Case 2: No object present
    if (fabs(val) < kNoObjectThresh) {
      previous = val;
      return object = kNoObject;
    }
    // Match this sample to an object index
    int obj_idx = kNoMatch;
    for (int i = 0; i < kMaxNumObjects; i++) {
      if (fabs(val - odconfig.weights[i]) < odconfig.tolerances[i]) 
        obj_idx = i;
    }
    previous = val;
//    Serial.println(obj_idx);
    
    // Case 3: No object matched
    if (obj_idx == kNoMatch) {
      return object = kNoMatch;
    }
    // Case 4: New candidate object
    if (object != obj_idx) {
      object = obj_idx;
      return kNoChange;
    }
//    // Case 5: Repeat candidate object
//    object_ctr++;
//    if (object_ctr < kMatchNumSamples)
//      return kNoChange;
//    // Case 6: Matched object
//    else {
//      object_ctr = 0;
//      return object;
//    }
  }

  float get_object_weight(int idx) { 
    if (idx > 0 && idx < kMaxNumObjects)
      return odconfig.weights[idx]; 
    else
      return 0.0f;
  }

  void set_offset(float offset) {
    odconfig.offset = offset;
  }

  float get_offset() {
    return odconfig.offset;
  }

  // Load object weights/tolerances from EEPROM
  bool load_config() {
    bool success = true;
    EEPROM.get(eeprom_addr, odconfig);
    if (!(strcmp(odconfig.valid, "abc123") == 0)) {
        odconfig = od_config_t();
        success = false;
    }
    return success;
  }

  // Save object weights/tolerances to EEPROM
  void save_config() {
    strcpy(odconfig.valid, "abc123");
    EEPROM.put(eeprom_addr, odconfig);
    EEPROM.commit();
  }

private:

  int eeprom_addr;
  od_config_t odconfig;

  float previous;
  int object;
  int object_ctr;
};

