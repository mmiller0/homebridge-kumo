import { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service, Characteristic } from 'homebridge';

import { KumoApi } from './kumo-api';
import { PLATFORM_NAME, PLUGIN_NAME } from './settings';

import { KumoPlatformAccessory } from './platformAccessory';
import { KumoPlatformAccessory_ductless } from './ductless';

/**
 * HomebridgePlatform
 * This class is the main constructor for your plugin, this is where you should
 * parse the user config and discover/register accessories with Homebridge.
 */
export class KumoHomebridgePlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service = this.api.hap.Service;
  public readonly Characteristic: typeof Characteristic = this.api.hap.Characteristic;

  // this is used to track restored cached accessories
  public readonly accessories: PlatformAccessory[] = [];

  readonly kumo!: KumoApi;

  constructor(
    public readonly log: Logger,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
    // initializing login information
    this.log = log;

    // Initialize our connection to the Kumo API.
    this.kumo = new KumoApi(this.log, config.username, config.password);

    this.log.debug('Finished initializing platform:', this.config.name);

    // When this event is fired it means Homebridge has restored all cached accessories from disk.
    // Dynamic Platform plugins should only register new accessories after this event was fired,
    // in order to ensure they weren't added to homebridge already. This event can also be used
    // to start discovery of new accessories.
    this.api.on('didFinishLaunching', () => {
      log.debug('Executed didFinishLaunching callback');
      // run the method to discover / register your devices as accessories
      this.discoverDevices();
    });
  }

  /**
   * This function is invoked when homebridge restores cached accessories from disk at startup.
   * It should be used to setup event handlers for characteristics and update respective values.
   */
  configureAccessory(accessory: PlatformAccessory) {
    this.log.info('Loading accessory from cache:', accessory.displayName);

    // add the restored accessory to the accessories cache so we can track if it has already been registered
    this.accessories.push(accessory);
  }

  /**
   * This is an example method showing how to register discovered accessories.
   * Accessories must only be registered once, previously created accessories
   * must not be registered again to prevent "duplicate UUID" errors.
   */
  
  async discoverDevices() {

    const flag = await this.kumo.acquireSecurityToken();
    if(!flag){
      this.log.error('Failed to login. Restart Homebridge to try again.');
      return false;
    }

    // loop over the discovered devices and register each one if it has not already been registered
    for (const device of this.kumo.devices) {
      // generate a unique id for the accessory this should be generated from
      // something globally unique, but constant, for example, the device serial
      // number or MAC address
      const uuid = this.api.hap.uuid.generate(device.serial);

      // see if an accessory with the same uuid has already been registered and restored from
      // the cached devices we stored in the `configureAccessory` method above
      const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid);

      if (existingAccessory) {
        // the accessory already exists
        this.log.info('Restoring existing accessory from cache:', existingAccessory.displayName);

        // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
        existingAccessory.context.zoneTable = device.zoneTable;
        /*
        if (this.config.directAccess) {
          existingAccessory.context.device = await this.kumo.queryDevice_Direct(device.serial);
        } else {
          existingAccessory.context.device = await this.kumo.queryDevice(device.serial);
        }
        */
        this.api.updatePlatformAccessories([existingAccessory]);

        // create the accessory handler for the restored accessory
        // this is imported from `platformAccessory.ts`
        if(existingAccessory.context.zoneTable.unitType === 'ductless') {
          this.log.info('Initializing "%s" as ductless unit.', existingAccessory.displayName);
          new KumoPlatformAccessory_ductless(this, existingAccessory);
        } else {
          this.log.info('Initializing "%s" as generic (unspecified) unit.', existingAccessory.displayName);
          new KumoPlatformAccessory(this, existingAccessory);
        }
        

      } else {
        // the accessory does not yet exist, so we need to create it
        this.log.info('Adding new accessory:', device.label);

        // create a new accessory
        const accessory = new this.api.platformAccessory(device.label, uuid);

        // store a copy of the device object in the `accessory.context`
        // the `context` property can be used to store any data about the accessory you may need
        accessory.context.serial = device.serial;
        accessory.context.zoneTable = device.zoneTable;
        /*
        if (this.config.directAccess) {
          accessory.context.device = await this.kumo.queryDevice_Direct(device.serial);
        } else {
          accessory.context.device = await this.kumo.queryDevice(device.serial);
        }
        */

        // create the accessory handler for the newly create accessory
        // this is imported from `platformAccessory.ts`
        if(accessory.context.zoneTable.unitType === 'ductless') {
          this.log.info('Initializing "%s" as ductless unit.', device.label);
          new KumoPlatformAccessory_ductless(this, accessory);
        } else {
          this.log.info('Initializing "%s" as generic (unspecified) unit.', device.label);
          new KumoPlatformAccessory(this, accessory);
        }

        // link the accessory to your platform
        this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      }

      // it is possible to remove platform accessories at any time using `api.unregisterPlatformAccessories`, eg.:
      // this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
    }

  }
}
