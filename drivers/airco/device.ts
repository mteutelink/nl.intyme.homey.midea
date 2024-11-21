import Homey from 'homey';
import { Device as MDevice, DeviceContext as MDeviceContext, GetStateCommand, DeviceState, SecurityContext as MSecurityContext, SetStateCommand } from 'midea-msmarthome-ac-euosk105';
import { FAN_SPEED, OPERATIONAL_MODE, SWING_MODE } from 'midea-msmarthome-ac-euosk105/dist/DeviceState';

class MyDevice extends Homey.Device {
  private _device: MDevice;
  private _securityContext: MSecurityContext = null;
  private _intervalId: any;

  private _updatingState: boolean = false;

  /**
   * onInit is called when the device is initialized.
   */
  async onInit() {
    this.log('Midea AC [' + this.getName() + '] initialized');

    const deviceContext: MDeviceContext = new MDeviceContext();
    deviceContext.id = this.getData().id;
    deviceContext.macAddress = this.getData().macAddress;
    deviceContext.udpId = this.getData().udpId;
    deviceContext.host = this.getStore().host;
    deviceContext.port = this.getStore().port;
    this._device = new MDevice(deviceContext);

    this._securityContext = await this._device.authenticate(new MSecurityContext(this.getStore().username, this.getStore().password));

    this.registerCapabilityListener("onoff", async (value, opts) => { return this.onCapability("onoff", value, opts); });
    this.registerCapabilityListener("target_temperature", async (value, opts) => { return this.onCapability("target_temperature", value, opts); });
    this.registerCapabilityListener("thermostat_mode", async (value, opts) => { return this.onCapability("thermostat_mode", value, opts); });
    this.registerCapabilityListener("thermostat_boost", async (value, opts) => { return this.onCapability("thermostat_boost", value, opts); });
    this.registerCapabilityListener("thermostat_fan_speed", async (value, opts) => { return this.onCapability("thermostat_fan_speed", value, opts); });
    this.registerCapabilityListener("thermostat_swing_mode", async (value, opts) => { return this.onCapability("thermostat_swing_mode", value, opts); });
    
    const settings = this.getSettings();
    this._initializePolling(settings.polling_interval);
  }

  private _initializePolling(pollingInterval: number) {
    if (this._intervalId) this.homey.clearInterval(this._intervalId);
    this._intervalId = this.homey.setInterval(async () => {
      if (!this._updatingState) {
        try {
          const state: DeviceState = await new GetStateCommand(this._device).execute();
          this._updateState(state);
        } catch (err) {
          this.log("error = " + err);
        }
      }
    }, pollingInterval * 1000);
  }

  private _updateState(state: DeviceState) {
    this.log("state = " + JSON.stringify(state));
    this.setCapabilityValue("onoff", state.powerOn);
    if (state.powerOn) {
      switch (state.operationalMode) {
        case OPERATIONAL_MODE.AUTO: this.setCapabilityValue("thermostat_mode", "auto"); break;
        case OPERATIONAL_MODE.COOL: this.setCapabilityValue("thermostat_mode", "cool"); break;
        case OPERATIONAL_MODE.HEAT: this.setCapabilityValue("thermostat_mode", "heat"); break;
        case OPERATIONAL_MODE.DRY: this.log("Thermostat mode 'dry' not supported"); break;
        case OPERATIONAL_MODE.FAN: this.log("Thermostat mode 'fan' not supported"); break;
      }
    } else {
      this.setCapabilityValue("thermostat_mode", "off");
    }
    this.setCapabilityValue("thermostat_boost", state.turboMode);
    this.setCapabilityValue("target_temperature", state.targetTemperature);
    this.setCapabilityValue("measure_temperature", state.indoorTemperature);
    this.setCapabilityValue("measure_temperature.outside", state.outdoorTemperature);
    switch (state.fanSpeed) {
      case FAN_SPEED.AUTO: this.setCapabilityValue("thermostat_fan_speed", "auto"); break;
      case FAN_SPEED.FIXED: this.setCapabilityValue("thermostat_fan_speed", "fixed"); break;
      case FAN_SPEED.SILENT: this.setCapabilityValue("thermostat_fan_speed", "silent"); break;
      case FAN_SPEED.LOW: this.setCapabilityValue("thermostat_fan_speed", "low"); break;
      case FAN_SPEED.MEDIUM: this.setCapabilityValue("thermostat_fan_speed", "medium"); break;
      case FAN_SPEED.HIGH: this.setCapabilityValue("thermostat_fan_speed", "high"); break;
    }
    switch (state.swingMode) {
      case SWING_MODE.OFF: this.setCapabilityValue("thermostat_swing_mode", "off"); break;
      case SWING_MODE.BOTH: this.setCapabilityValue("thermostat_swing_mode", "both"); break;
      case SWING_MODE.VERTICAL: this.setCapabilityValue("thermostat_swing_mode", "vertical"); break;
      case SWING_MODE.HORIZONTAL: this.setCapabilityValue("thermostat_swing_mode", "horizontal"); break;
    }
  } 

  /**
   * onAdded is called when the user adds the device, called just after pairing.
   */
  async onAdded() {
    this.log('Midea AC [' + this.getName() + '] has been added');
  }

  /**
   * onSettings is called when the user updates the device's settings.
   * @param {object} event the onSettings event data
   * @param {object} event.oldSettings The old settings object
   * @param {object} event.newSettings The new settings object
   * @param {string[]} event.changedKeys An array of keys changed since the previous version
   * @returns {Promise<string|void>} return a custom message that will be displayed
   */
  async onSettings({
    oldSettings,
    newSettings,
    changedKeys,
  }: {
    oldSettings: { [key: string]: boolean | string | number | undefined | null };
    newSettings: { [key: string]: boolean | string | number | undefined | null };
    changedKeys: string[];
  }): Promise<string | void> {

    if (changedKeys.includes("polling_interval")) {
      this._initializePolling(+newSettings.polling_interval);
    }
  }

  /**
   * onRenamed is called when the user updates the device's name.
   * This method can be used this to synchronise the name to the device.
   * @param {string} name The new name
   */
  async onRenamed(name: string) {
    this.log('Midea AC [' + this.getName() + '] was renamed to "' + name + '"');
  }

  /**
   * onDeleted is called when the user deleted the device.
   */
  async onDeleted() {
    this.homey.clearInterval(this._intervalId);
    this.log('Midea AC [' + this.getName() + '] has been deleted');
  }

  async onCapability(capability: string, value: any, opts: any) {
    try {
      this._updatingState = true; 
      let state: DeviceState = await new GetStateCommand(this._device).execute();

      switch (capability) {
        case "onoff": state.powerOn = value; break;
        case "target_temperature": state.targetTemperature = value; break;
        case "thermostat_mode": {
          switch (value) {
            case "auto": state.powerOn = true; state.operationalMode = OPERATIONAL_MODE.AUTO; break;
            case "cool": state.powerOn = true; state.operationalMode = OPERATIONAL_MODE.COOL; break;
            case "heat": state.powerOn = true; state.operationalMode = OPERATIONAL_MODE.HEAT; break;
            case "off": state.powerOn = false; break;
          }
          break;
        }
        case "thermostat_boost": state.turboMode = value; break;
        case "thermostat_fan_speed": {
          switch (value) {
            case "auto": state.fanSpeed= FAN_SPEED.AUTO; break;
            case "fixed": state.fanSpeed = FAN_SPEED.FIXED; break;
            case "silent": state.fanSpeed = FAN_SPEED.SILENT; break;
            case "low": state.fanSpeed = FAN_SPEED.LOW; break;
            case "medium": state.fanSpeed = FAN_SPEED.MEDIUM; break;
            case "high": state.fanSpeed = FAN_SPEED.HIGH; break;
            //case "full": state.fanSpeed = FAN_SPEED.FULL; break;
          }
          break;
        }
        case "thermostat_swing_mode": {
          switch (value) {
            case "off": state.swingMode = SWING_MODE.OFF; break;
            case "both": state.swingMode = SWING_MODE.BOTH; break;
            case "vertical": state.swingMode = SWING_MODE.VERTICAL; break;
            case "horizontal": state.swingMode = SWING_MODE.HORIZONTAL; break;
          }
        } 
      }

      state = await new SetStateCommand(this._device, state).execute();
      this._updateState(state);
    } finally {
      this._updatingState = false; 
    }
  }
}

module.exports = MyDevice;