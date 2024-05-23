import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output, ViewChild } from '@angular/core';
import { BrowserCodeReader } from '@zxing/browser';
import { BarcodeFormat, DecodeHintType } from '@zxing/library';
import { BrowserMultiFormatContinuousReader } from './browser-multi-format-continuous-reader';
import * as i0 from "@angular/core";
export class ZXingScannerComponent {
    /**
     * Constructor to build the object and do some DI.
     */
    constructor() {
        /**
         * Delay between attempts to decode (default is 500ms)
         */
        this.timeBetweenScans = 500;
        /**
         * Delay between successful decode (default is 500ms)
         */
        this.delayBetweenScanSuccess = 500;
        /**
         * How the preview element should be fit inside the :host container.
         */
        this.previewFitMode = 'cover';
        this._ready = false;
        // instance based emitters
        this.autostarted = new EventEmitter();
        this.autostarting = new EventEmitter();
        this.torchCompatible = new EventEmitter(false);
        this.scanSuccess = new EventEmitter();
        this.scanFailure = new EventEmitter();
        this.scanError = new EventEmitter();
        this.scanComplete = new EventEmitter();
        this.camerasFound = new EventEmitter();
        this.camerasNotFound = new EventEmitter();
        this.permissionResponse = new EventEmitter(true);
        this.hasDevices = new EventEmitter();
        this.deviceChange = new EventEmitter();
        this._enabled = true;
        this._hints = new Map();
        this.autofocusEnabled = true;
        this.autostart = true;
        this.formats = [BarcodeFormat.QR_CODE];
        // computed data
        this.hasNavigator = typeof navigator !== 'undefined';
        this.isMediaDevicesSupported = this.hasNavigator && !!navigator.mediaDevices;
    }
    /**
     * Exposes the current code reader, so the user can use it's APIs.
     */
    get codeReader() {
        return this._codeReader;
    }
    /**
     * User device input
     */
    set device(device) {
        if (!this._ready) {
            this._devicePreStart = device;
            // let's ignore silently, users don't like logs
            return;
        }
        if (this.isAutostarting) {
            // do not allow setting devices during auto-start, since it will set one and emit it.
            console.warn('Avoid setting a device during auto-start.');
            return;
        }
        if (this.isCurrentDevice(device)) {
            console.warn('Setting the same device is not allowed.');
            return;
        }
        if (!this.hasPermission) {
            console.warn('Permissions not set yet, waiting for them to be set to apply device change.');
            // this.permissionResponse
            //   .pipe(
            //     take(1),
            //     tap(() => console.log(`Permissions set, applying device change${device ? ` (${device.deviceId})` : ''}.`))
            //   )
            //   .subscribe(() => this.device = device);
            return;
        }
        this.setDevice(device);
    }
    /**
     * User device accessor.
     */
    get device() {
        return this._device;
    }
    /**
     * Returns all the registered formats.
     */
    get formats() {
        return this.hints.get(DecodeHintType.POSSIBLE_FORMATS);
    }
    /**
     * Registers formats the scanner should support.
     *
     * @param input BarcodeFormat or case-insensitive string array.
     */
    set formats(input) {
        if (typeof input === 'string') {
            throw new Error('Invalid formats, make sure the [formats] input is a binding.');
        }
        // formats may be set from html template as BarcodeFormat or string array
        const formats = input.map(f => this.getBarcodeFormatOrFail(f));
        const hints = this.hints;
        // updates the hints
        hints.set(DecodeHintType.POSSIBLE_FORMATS, formats);
        // handles updating the codeReader
        this.hints = hints;
    }
    /**
     * Returns all the registered hints.
     */
    get hints() {
        return this._hints;
    }
    /**
     * Does what it takes to set the hints.
     */
    set hints(hints) {
        this._hints = hints;
        // new instance with new hints.
        this.codeReader?.setHints(this._hints);
    }
    /**
     * Sets the desired constraints in all video tracks.
     * @experimental
     */
    set videoConstraints(constraints) {
        // new instance with new hints.
        const controls = this.codeReader?.getScannerControls();
        if (!controls) {
            // fails silently
            return;
        }
        controls?.streamVideoConstraintsApply(constraints);
    }
    /**
     *
     */
    set isAutostarting(state) {
        this._isAutostarting = state;
        this.autostarting.next(state);
    }
    /**
     *
     */
    get isAutostarting() {
        return this._isAutostarting;
    }
    /**
     * Can turn on/off the device flashlight.
     *
     * @experimental Torch/Flash APIs are not stable in all browsers, it may be buggy!
     */
    set torch(onOff) {
        try {
            const controls = this.getCodeReader().getScannerControls();
            controls.switchTorch(onOff);
        }
        catch (error) {
            // ignore error
        }
    }
    /**
     * Starts and Stops the scanning.
     */
    set enable(enabled) {
        this._enabled = Boolean(enabled);
        if (!this._enabled) {
            this.reset();
            BrowserMultiFormatContinuousReader.releaseAllStreams();
        }
        else {
            if (this.device) {
                this.scanFromDevice(this.device.deviceId);
            }
            else {
                this.init();
            }
        }
    }
    /**
     * Tells if the scanner is enabled or not.
     */
    get enabled() {
        return this._enabled;
    }
    /**
     * If is `tryHarder` enabled.
     */
    get tryHarder() {
        return this.hints.get(DecodeHintType.TRY_HARDER);
    }
    /**
     * Enable/disable tryHarder hint.
     */
    set tryHarder(enable) {
        const hints = this.hints;
        if (enable) {
            hints.set(DecodeHintType.TRY_HARDER, true);
        }
        else {
            hints.delete(DecodeHintType.TRY_HARDER);
        }
        this.hints = hints;
    }
    /**
     * Gets and registers all cameras.
     */
    async askForPermission() {
        if (!this.hasNavigator) {
            console.error('@zxing/ngx-scanner', 'Can\'t ask permission, navigator is not present.');
            this.setPermission(null);
            return this.hasPermission;
        }
        if (!this.isMediaDevicesSupported) {
            console.error('@zxing/ngx-scanner', 'Can\'t get user media, this is not supported.');
            this.setPermission(null);
            return this.hasPermission;
        }
        let stream;
        let permission;
        try {
            // Will try to ask for permission
            stream = await this.getAnyVideoDevice();
            permission = !!stream;
        }
        catch (err) {
            return this.handlePermissionException(err);
        }
        finally {
            this.terminateStream(stream);
        }
        this.setPermission(permission);
        // Returns the permission
        return permission;
    }
    /**
     *
     */
    getAnyVideoDevice() {
        return navigator.mediaDevices.getUserMedia({ video: true });
    }
    /**
     * Terminates a stream and it's tracks.
     */
    terminateStream(stream) {
        if (stream) {
            stream.getTracks().forEach(t => t.stop());
        }
        stream = undefined;
    }
    async init() {
        if (!this.autostart) {
            console.warn('Feature \'autostart\' disabled. Permissions and devices recovery has to be run manually.');
            // does the necessary configuration without autostarting
            this.initAutostartOff();
            this._ready = true;
            return;
        }
        // configures the component and starts the scanner
        await this.initAutostartOn();
        this._ready = true;
    }
    /**
     * Initializes the component without starting the scanner.
     */
    initAutostartOff() {
        // do not ask for permission when autostart is off
        this.isAutostarting = false;
        // just update devices information
        this.updateVideoInputDevices();
        if (this._device && this._devicePreStart) {
            this.setDevice(this._devicePreStart);
        }
    }
    /**
     * Initializes the component and starts the scanner.
     * Permissions are asked to accomplish that.
     */
    async initAutostartOn() {
        this.isAutostarting = true;
        let hasPermission;
        try {
            // Asks for permission before enumerating devices so it can get all the device's info
            hasPermission = await this.askForPermission();
        }
        catch (e) {
            console.error('Exception occurred while asking for permission:', e);
            return;
        }
        // from this point, things gonna need permissions
        if (hasPermission) {
            const devices = await this.updateVideoInputDevices();
            await this.autostartScanner([...devices]);
        }
        this.isAutostarting = false;
        this.autostarted.next();
    }
    /**
     * Checks if the given device is the current defined one.
     */
    isCurrentDevice(device) {
        return device?.deviceId === this._device?.deviceId;
    }
    /**
     * Executes some actions before destroy the component.
     */
    ngOnDestroy() {
        this.reset();
        BrowserMultiFormatContinuousReader.releaseAllStreams();
    }
    /**
     *
     */
    ngOnInit() {
        this.init();
    }
    /**
     * Stops the scanning, if any.
     */
    scanStop() {
        if (this._scanSubscription) {
            this.codeReader?.getScannerControls().stop();
            this._scanSubscription?.unsubscribe();
            this._scanSubscription = undefined;
        }
        this.torchCompatible.next(false);
    }
    /**
     * Stops the scanning, if any.
     */
    scanStart() {
        if (this._scanSubscription) {
            throw new Error('There is already a scan process running.');
        }
        if (!this._device) {
            throw new Error('No device defined, cannot start scan, please define a device.');
        }
        this.scanFromDevice(this._device.deviceId);
    }
    /**
     * Stops old `codeReader` and starts scanning in a new one.
     */
    restart() {
        // note only necessary for now because of the Torch
        this._codeReader = undefined;
        const prevDevice = this._reset();
        if (!prevDevice) {
            return;
        }
        this.device = prevDevice;
    }
    /**
     * Discovers and updates known video input devices.
     */
    async updateVideoInputDevices() {
        // permissions aren't needed to get devices, but to access them and their info
        const devices = await BrowserCodeReader.listVideoInputDevices() || [];
        const hasDevices = devices && devices.length > 0;
        // stores discovered devices and updates information
        this.hasDevices.next(hasDevices);
        this.camerasFound.next([...devices]);
        if (!hasDevices) {
            this.camerasNotFound.next(null);
        }
        return devices;
    }
    /**
     * Starts the scanner with the back camera otherwise take the last
     * available device.
     */
    async autostartScanner(devices) {
        const matcher = ({ label }) => /back|trás|rear|traseira|environment|ambiente/gi.test(label);
        // select the rear camera by default, otherwise take the last camera.
        const device = devices.find(matcher) || devices.pop();
        if (!device) {
            throw new Error('Impossible to autostart, no input devices available.');
        }
        await this.setDevice(device);
        this.deviceChange.next(device);
    }
    /**
     * Dispatches the scan success event.
     *
     * @param result the scan result.
     */
    dispatchScanSuccess(result) {
        this.scanSuccess.next(result.getText());
    }
    /**
     * Dispatches the scan failure event.
     */
    dispatchScanFailure(reason) {
        this.scanFailure.next(reason);
    }
    /**
     * Dispatches the scan error event.
     *
     * @param error the error thing.
     */
    dispatchScanError(error) {
        if (!this.scanError.observed) {
            console.error(`zxing scanner component: ${error.name}`, error);
            console.warn('Use the `(scanError)` property to handle errors like this!');
        }
        this.scanError.next(error);
    }
    /**
     * Dispatches the scan event.
     *
     * @param result the scan result.
     */
    dispatchScanComplete(result) {
        this.scanComplete.next(result);
    }
    /**
     * Returns the filtered permission.
     */
    handlePermissionException(err) {
        // failed to grant permission to video input
        console.error('@zxing/ngx-scanner', 'Error when asking for permission.', err);
        let permission;
        switch (err.name) {
            // usually caused by not secure origins
            case 'NotSupportedError':
                console.warn('@zxing/ngx-scanner', err.message);
                // could not claim
                permission = null;
                // can't check devices
                this.hasDevices.next(null);
                break;
            // user denied permission
            case 'NotAllowedError':
                console.warn('@zxing/ngx-scanner', err.message);
                // claimed and denied permission
                permission = false;
                // this means that input devices exists
                this.hasDevices.next(true);
                break;
            // the device has no attached input devices
            case 'NotFoundError':
                console.warn('@zxing/ngx-scanner', err.message);
                // no permissions claimed
                permission = null;
                // because there was no devices
                this.hasDevices.next(false);
                // tells the listener about the error
                this.camerasNotFound.next(err);
                break;
            case 'NotReadableError':
                console.warn('@zxing/ngx-scanner', 'Couldn\'t read the device(s)\'s stream, it\'s probably in use by another app.');
                // no permissions claimed
                permission = null;
                // there are devices, which I couldn't use
                this.hasDevices.next(false);
                // tells the listener about the error
                this.camerasNotFound.next(err);
                break;
            default:
                console.warn('@zxing/ngx-scanner', 'I was not able to define if I have permissions for camera or not.', err);
                // unknown
                permission = null;
                // this.hasDevices.next(undefined;
                break;
        }
        this.setPermission(permission);
        // tells the listener about the error
        this.permissionResponse.error(err);
        return permission;
    }
    /**
     * Returns a valid BarcodeFormat or fails.
     */
    getBarcodeFormatOrFail(format) {
        return typeof format === 'string'
            ? BarcodeFormat[format.trim().toUpperCase()]
            : format;
    }
    /**
     * Return a code reader, create one if non exist
     */
    getCodeReader() {
        if (!this._codeReader) {
            const options = {
                delayBetweenScanAttempts: this.timeBetweenScans,
                delayBetweenScanSuccess: this.delayBetweenScanSuccess,
            };
            this._codeReader = new BrowserMultiFormatContinuousReader(this.hints, options);
        }
        return this._codeReader;
    }
    /**
     * Starts the continuous scanning for the given device.
     *
     * @param deviceId The deviceId from the device.
     */
    async scanFromDevice(deviceId) {
        const videoElement = this.previewElemRef.nativeElement;
        const codeReader = this.getCodeReader();
        const scanStream = await codeReader.scanFromDeviceObservable(deviceId, videoElement);
        if (!scanStream) {
            throw new Error('Undefined decoding stream, aborting.');
        }
        const next = (x) => this._onDecodeResult(x.result, x.error);
        const error = (err) => this._onDecodeError(err);
        const complete = () => { };
        this._scanSubscription = scanStream.subscribe(next, error, complete);
        if (this._scanSubscription.closed) {
            return;
        }
        const controls = codeReader.getScannerControls();
        const hasTorchControl = typeof controls.switchTorch !== 'undefined';
        this.torchCompatible.next(hasTorchControl);
    }
    /**
     * Handles decode errors.
     */
    _onDecodeError(err) {
        this.dispatchScanError(err);
        // this.reset();
    }
    /**
     * Handles decode results.
     */
    _onDecodeResult(result, error) {
        if (result) {
            this.dispatchScanSuccess(result);
        }
        else {
            this.dispatchScanFailure(error);
        }
        this.dispatchScanComplete(result);
    }
    /**
     * Stops the code reader and returns the previous selected device.
     */
    _reset() {
        if (!this._codeReader) {
            return;
        }
        // clearing codeReader first to prevent setOptions error appearing in several Chromium versions
        this._codeReader = undefined;
        const device = this._device;
        // do not set this.device inside this method, it would create a recursive loop
        this.device = undefined;
        return device;
    }
    /**
     * Resets the scanner and emits device change.
     */
    reset() {
        this._reset();
        this.deviceChange.emit(null);
    }
    /**
     * Sets the current device.
     */
    async setDevice(device) {
        // instantly stops the scan before changing devices
        this.scanStop();
        // correctly sets the new (or none) device
        this._device = device || undefined;
        if (!this._device) {
            // cleans the video because user removed the device
            BrowserCodeReader.cleanVideoSource(this.previewElemRef.nativeElement);
        }
        // if enabled, starts scanning
        if (this._enabled && device) {
            await this.scanFromDevice(device.deviceId);
        }
    }
    /**
     * Sets the permission value and emits the event.
     */
    setPermission(hasPermission) {
        this.hasPermission = hasPermission;
        this.permissionResponse.next(hasPermission);
    }
}
ZXingScannerComponent.ɵfac = i0.ɵɵngDeclareFactory({ minVersion: "12.0.0", version: "15.0.0", ngImport: i0, type: ZXingScannerComponent, deps: [], target: i0.ɵɵFactoryTarget.Component });
ZXingScannerComponent.ɵcmp = i0.ɵɵngDeclareComponent({ minVersion: "14.0.0", version: "15.0.0", type: ZXingScannerComponent, selector: "zxing-scanner", inputs: { autofocusEnabled: "autofocusEnabled", timeBetweenScans: "timeBetweenScans", delayBetweenScanSuccess: "delayBetweenScanSuccess", autostart: "autostart", previewFitMode: "previewFitMode", device: "device", formats: "formats", videoConstraints: "videoConstraints", torch: "torch", enable: "enable", tryHarder: "tryHarder" }, outputs: { autostarted: "autostarted", autostarting: "autostarting", torchCompatible: "torchCompatible", scanSuccess: "scanSuccess", scanFailure: "scanFailure", scanError: "scanError", scanComplete: "scanComplete", camerasFound: "camerasFound", camerasNotFound: "camerasNotFound", permissionResponse: "permissionResponse", hasDevices: "hasDevices", deviceChange: "deviceChange" }, viewQueries: [{ propertyName: "previewElemRef", first: true, predicate: ["preview"], descendants: true, static: true }], ngImport: i0, template: "<video #preview [style.object-fit]=\"previewFitMode\">\n  <p>\n    Your browser does not support this feature, please try to upgrade it.\n  </p>\n  <p>\n    Seu navegador n\u00E3o suporta este recurso, por favor tente atualiz\u00E1-lo.\n  </p>\n</video>\n", styles: [":host{display:block}video{width:100%;height:auto;object-fit:contain}\n"], changeDetection: i0.ChangeDetectionStrategy.OnPush });
i0.ɵɵngDeclareClassMetadata({ minVersion: "12.0.0", version: "15.0.0", ngImport: i0, type: ZXingScannerComponent, decorators: [{
            type: Component,
            args: [{ selector: 'zxing-scanner', changeDetection: ChangeDetectionStrategy.OnPush, template: "<video #preview [style.object-fit]=\"previewFitMode\">\n  <p>\n    Your browser does not support this feature, please try to upgrade it.\n  </p>\n  <p>\n    Seu navegador n\u00E3o suporta este recurso, por favor tente atualiz\u00E1-lo.\n  </p>\n</video>\n", styles: [":host{display:block}video{width:100%;height:auto;object-fit:contain}\n"] }]
        }], ctorParameters: function () { return []; }, propDecorators: { previewElemRef: [{
                type: ViewChild,
                args: ['preview', { static: true }]
            }], autofocusEnabled: [{
                type: Input
            }], timeBetweenScans: [{
                type: Input
            }], delayBetweenScanSuccess: [{
                type: Input
            }], autostarted: [{
                type: Output
            }], autostarting: [{
                type: Output
            }], autostart: [{
                type: Input
            }], previewFitMode: [{
                type: Input
            }], torchCompatible: [{
                type: Output
            }], scanSuccess: [{
                type: Output
            }], scanFailure: [{
                type: Output
            }], scanError: [{
                type: Output
            }], scanComplete: [{
                type: Output
            }], camerasFound: [{
                type: Output
            }], camerasNotFound: [{
                type: Output
            }], permissionResponse: [{
                type: Output
            }], hasDevices: [{
                type: Output
            }], device: [{
                type: Input
            }], deviceChange: [{
                type: Output
            }], formats: [{
                type: Input
            }], videoConstraints: [{
                type: Input
            }], torch: [{
                type: Input
            }], enable: [{
                type: Input
            }], tryHarder: [{
                type: Input
            }] } });
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoienhpbmctc2Nhbm5lci5jb21wb25lbnQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi9wcm9qZWN0cy96eGluZy1zY2FubmVyL3NyYy9saWIvenhpbmctc2Nhbm5lci5jb21wb25lbnQudHMiLCIuLi8uLi8uLi8uLi9wcm9qZWN0cy96eGluZy1zY2FubmVyL3NyYy9saWIvenhpbmctc2Nhbm5lci5jb21wb25lbnQuaHRtbCJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSxPQUFPLEVBQ0wsdUJBQXVCLEVBQ3ZCLFNBQVMsRUFFVCxZQUFZLEVBQ1osS0FBSyxFQUdMLE1BQU0sRUFDTixTQUFTLEVBQ1YsTUFBTSxlQUFlLENBQUM7QUFDdkIsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sZ0JBQWdCLENBQUM7QUFDbkQsT0FBTyxFQUNMLGFBQWEsRUFDYixjQUFjLEVBR2YsTUFBTSxnQkFBZ0IsQ0FBQztBQUV4QixPQUFPLEVBQUUsa0NBQWtDLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQzs7QUFVOUYsTUFBTSxPQUFPLHFCQUFxQjtJQW1XaEM7O09BRUc7SUFDSDtRQTNTQTs7V0FFRztRQUVILHFCQUFnQixHQUFHLEdBQUcsQ0FBQztRQUV2Qjs7V0FFRztRQUVILDRCQUF1QixHQUFHLEdBQUcsQ0FBQztRQW9COUI7O1dBRUc7UUFFSCxtQkFBYyxHQUF5RCxPQUFPLENBQUM7UUF3RHZFLFdBQU0sR0FBRyxLQUFLLENBQUM7UUFrTnJCLDBCQUEwQjtRQUMxQixJQUFJLENBQUMsV0FBVyxHQUFHLElBQUksWUFBWSxFQUFFLENBQUM7UUFDdEMsSUFBSSxDQUFDLFlBQVksR0FBRyxJQUFJLFlBQVksRUFBRSxDQUFDO1FBQ3ZDLElBQUksQ0FBQyxlQUFlLEdBQUcsSUFBSSxZQUFZLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDL0MsSUFBSSxDQUFDLFdBQVcsR0FBRyxJQUFJLFlBQVksRUFBRSxDQUFDO1FBQ3RDLElBQUksQ0FBQyxXQUFXLEdB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dGVudCI6WyJpbXBvcnQge1xuICBDaGFuZ2VEZXRlY3Rpb25TdHJhdGVneSxcbiAgQ29tcG9uZW50LFxuICBFbGVtZW50UmVmLFxuICBFdmVudEVtaXR0ZXIsXG4gIElucHV0LFxuICBPbkRlc3Ryb3ksXG4gIE9uSW5pdCxcbiAgT3V0cHV0LFxuICBWaWV3Q2hpbGRcbn0gZnJvbSAnQGFuZ3VsYXIvY29yZSc7XG5pbXBvcnQgeyBCcm93c2VyQ29kZVJlYWRlciB9IGZyb20gJ0B6eGluZy9icm93c2VyJztcbmltcG9ydCB7XG4gIEJhcmNvZGVGb3JtYXQsXG4gIERlY29kZUhpbnRUeXBlLFxuICBFeGNlcHRpb24sXG4gIFJlc3VsdFxufSBmcm9tICdAenhpbmcvbGlicmFyeSc7XG5pbXBvcnQgeyBTdWJzY3JpcHRpb24gfSBmcm9tICdyeGpzJztcbmltcG9ydCB7IEJyb3dzZXJNdWx0aUZvcm1hdENvbnRpbnVvdXNSZWFkZXIgfSBmcm9tICcuL2Jyb3dzZXItbXVsdGktZm9ybWF0LWNvbnRpbnVvdXMtcmVhZGVyJztcbmltcG9ydCB7IFJlc3VsdEFuZEVycm9yIH0gZnJvbSAnLi9SZXN1bHRBbmRFcnJvcic7XG5cblxuQENvbXBvbmVudCh7XG4gIHNlbGVjdG9yOiAnenhpbmctc2Nhbm5lcicsXG4gIHRlbXBsYXRlVXJsOiAnLi96eGluZy1zY2FubmVyLmNvbXBvbmVudC5odG1sJyxcbiAgc3R5bGVVcmxzOiBbJy4venhpbmctc2Nhbm5lci5jb21wb25lbnQuc2NzcyddLFxuICBjaGFuZ2VEZXRlY3Rpb246IENoYW5nZURldGVjdGlvblN0cmF0ZWd5Lk9uUHVzaFxufSlcbmV4cG9ydCBjbGFzcyBaWGluZ1NjYW5uZXJDb21wb25lbnQgaW1wbGVtZW50cyBPbkluaXQsIE9uRGVzdHJveSB7XG5cbiAgLyoqXG4gICAqIFN1cHBvcnRlZCBIaW50cyBtYXAuXG4gICAqL1xuICBwcml2YXRlIF9oaW50czogTWFwPERlY29kZUhpbnRUeXBlLCBhbnk+IHwgbnVsbDtcblxuICAvKipcbiAgICogVGhlIFpYaW5nIGNvZGUgcmVhZGVyLlxuICAgKi9cbiAgcHJpdmF0ZSBfY29kZVJlYWRlcjogQnJvd3Nlck11bHRpRm9ybWF0Q29udGludW91c1JlYWRlcjtcblxuICAvKipcbiAgICogVGhlIGRldmljZSB0aGF0IHNob3VsZCBiZSB1c2VkIHRvIHNjYW4gdGhpbmdzLlxuICAgKi9cbiAgcHJpdmF0ZSBfZGV2aWNlOiBNZWRpYURldmljZUluZm87XG5cbiAgLyoqXG4gICAqIFRoZSBkZXZpY2UgdGhhdCBzaG91bGQgYmUgdXNlZCB0byBzY2FuIHRoaW5ncy5cbiAgICovXG4gIHByaXZhdGUgX2VuYWJsZWQ6IGJvb2xlYW47XG5cbiAgLyoqXG4gICAqXG4gICAqL1xuICBwcml2YXRlIF9pc0F1dG9zdGFydGluZzogYm9vbGVhbjtcblxuICAvKipcbiAgICogSGFzIGBuYXZpZ2F0b3JgIGFjY2Vzcy5cbiAgICovXG4gIHByaXZhdGUgaGFzTmF2aWdhdG9yOiBib29sZWFuO1xuXG4gIC8qKlxuICAgKiBTYXlzIGlmIHNvbWUgbmF0aXZlIEFQSSBpcyBzdXBwb3J0ZWQuXG4gICAqL1xuICBwcml2YXRlIGlzTWVkaWFEZXZpY2VzU3VwcG9ydGVkOiBib29sZWFuO1xuXG4gIC8qKlxuICAgKiBJZiB0aGUgdXNlci1hZ2VudCBhbGxvd2VkIHRoZSB1c2Ugb2YgdGhlIGNhbWVyYSBvciBub3QuXG4gICAqL1xuICBwcml2YXRlIGhhc1Blcm1pc3Npb246IGJvb2xlYW4gfCBudWxsO1xuXG4gIC8qKlxuICAgKiBVbnN1YnNjcmliZSB0byBzdG9wIHNjYW5uaW5nLlxuICAgKi9cbiAgcHJpdmF0ZSBfc2NhblN1YnNjcmlwdGlvbj86IFN1YnNjcmlwdGlvbjtcblxuICAvKipcbiAgICogUmVmZXJlbmNlIHRvIHRoZSBwcmV2aWV3IGVsZW1lbnQsIHNob3VsZCBiZSB0aGUgYHZpZGVvYCB0YWcuXG4gICAqL1xuICBAVmlld0NoaWxkKCdwcmV2aWV3JywgeyBzdGF0aWM6IHRydWUgfSlcbiAgcHJldmlld0VsZW1SZWY6IEVsZW1lbnRSZWY8SFRNTFZpZGVvRWxlbWVudD47XG5cbiAgLyoqXG4gICAqIEVuYWJsZSBvciBkaXNhYmxlIGF1dG9mb2N1cyBvZiB0aGUgY2FtZXJhIChtaWdodCBoYXZlIGFuIGltcGFjdCBvbiBwZXJmb3JtYW5jZSlcbiAgICovXG4gIEBJbnB1dCgpXG4gIGF1dG9mb2N1c0VuYWJsZWQ6IGJvb2xlYW47XG5cbiAgLyoqXG4gICAqIERlbGF5IGJldHdlZW4gYXR0ZW1wdHMgdG8gZGVjb2RlIChkZWZhdWx0IGlzIDUwMG1zKVxuICAgKi9cbiAgQElucHV0KClcbiAgdGltZUJldHdlZW5TY2FucyA9IDUwMDtcblxuICAvKipcbiAgICogRGVsYXkgYmV0d2VlbiBzdWNjZXNzZnVsIGRlY29kZSAoZGVmYXVsdCBpcyA1MDBtcylcbiAgICovXG4gIEBJbnB1dCgpXG4gIGRlbGF5QmV0d2VlblNjYW5TdWNjZXNzID0gNTAwO1xuXG4gIC8qKlxuICAgKiBFbWl0cyB3aGVuIGFuZCBpZiB0aGUgc2Nhbm5lciBpcyBhdXRvc3RhcnRlZC5cbiAgICovXG4gIEBPdXRwdXQoKVxuICBhdXRvc3RhcnRlZDogRXZlbnRFbWl0dGVyPHZvaWQ+O1xuXG4gIC8qKlxuICAgKiBUcnVlIGR1cmluZyBhdXRvc3RhcnQgYW5kIGZhbHNlIGFmdGVyLiBJdCB3aWxsIGJlIG51bGwgaWYgd29uJ3QgYXV0b3N0YXJ0IGF0IGFsbC5cbiAgICovXG4gIEBPdXRwdXQoKVxuICBhdXRvc3RhcnRpbmc6IEV2ZW50RW1pdHRlcjxib29sZWFuPjtcblxuICAvKipcbiAgICogSWYgdGhlIHNjYW5uZXIgc2hvdWxkIGF1dG9zdGFydCB3aXRoIHRoZSBmaXJzdCBhdmFpbGFibGUgZGV2aWNlLlxuICAgKi9cbiAgQElucHV0KClcbiAgYXV0b3N0YXJ0OiBib29sZWFuO1xuXG4gIC8qKlxuICAgKiBIb3cgdGhlIHByZXZpZXcgZWxlbWVudCBzaG91bGQgYmUgZml0IGluc2lkZSB0aGUgOmhvc3QgY29udGFpbmVyLlxuICAgKi9cbiAgQElucHV0KClcbiAgcHJldmlld0ZpdE1vZGU6ICdmaWxsJyB8ICdjb250YWluJyB8ICdjb3ZlcicgfCAnc2NhbGUtZG93bicgfCAnbm9uZScgPSAnY292ZXInO1xuXG4gIC8qKlxuICAgKiBFbWl0cyBldmVudHMgd2hlbiB0aGUgdG9yY2ggY29tcGF0aWJpbGl0eSBpcyBjaGFuZ2VkLlxuICAgKi9cbiAgQE91dHB1dCgpXG4gIHRvcmNoQ29tcGF0aWJsZTogRXZlbnRFbWl0dGVyPGJvb2xlYW4+O1xuXG4gIC8qKlxuICAgKiBFbWl0cyBldmVudHMgd2hlbiBhIHNjYW4gaXMgc3VjY2Vzc2Z1bCBwZXJmb3JtZWQsIHdpbGwgaW5qZWN0IHRoZSBzdHJpbmcgdmFsdWUgb2YgdGhlIFFSLWNvZGUgdG8gdGhlIGNhbGxiYWNrLlxuICAgKi9cbiAgQE91dHB1dCgpXG4gIHNjYW5TdWNjZXNzOiBFdmVudEVtaXR0ZXI8c3RyaW5nPjtcblxuICAvKipcbiAgICogRW1pdHMgZXZlbnRzIHdoZW4gYSBzY2FuIGZhaWxzIHdpdGhvdXQgZXJyb3JzLCB1c2VmdWwgdG8ga25vdyBob3cgbXVjaCBzY2FuIHRyaWVzIHdoZXJlIG1hZGUuXG4gICAqL1xuICBAT3V0cHV0KClcbiAgc2NhbkZhaWx1cmU6IEV2ZW50RW1pdHRlcjxFeGNlcHRpb24gfCB1bmRlZmluZWQ+O1xuXG4gIC8qKlxuICAgKiBFbWl0cyBldmVudHMgd2hlbiBhIHNjYW4gdGhyb3dzIHNvbWUgZXJyb3IsIHdpbGwgaW5qZWN0IHRoZSBlcnJvciB0byB0aGUgY2FsbGJhY2suXG4gICAqL1xuICBAT3V0cHV0KClcbiAgc2NhbkVycm9yOiBFdmVudEVtaXR0ZXI8RXJyb3I+O1xuXG4gIC8qKlxuICAgKiBFbWl0cyBldmVudHMgd2hlbiBhIHNjYW4gaXMgcGVyZm9ybWVkLCB3aWxsIGluamVjdCB0aGUgUmVzdWx0IHZhbHVlIG9mIHRoZSBRUi1jb2RlIHNjYW4gKGlmIGF2YWlsYWJsZSkgdG8gdGhlIGNhbGxiYWNrLlxuICAgKi9cbiAgQE91dHB1dCgpXG4gIHNjYW5Db21wbGV0ZTogRXZlbnRFbWl0dGVyPFJlc3VsdD47XG5cbiAgLyoqXG4gICAqIEVtaXRzIGV2ZW50cyB3aGVuIG5vIGNhbWVyYXMgYXJlIGZvdW5kLCB3aWxsIGluamVjdCBhbiBleGNlcHRpb24gKGlmIGF2YWlsYWJsZSkgdG8gdGhlIGNhbGxiYWNrLlxuICAgKi9cbiAgQE91dHB1dCgpXG4gIGNhbWVyYXNGb3VuZDogRXZlbnRFbWl0dGVyPE1lZGlhRGV2aWNlSW5mb1tdPjtcblxuICAvKipcbiAgICogRW1pdHMgZXZlbnRzIHdoZW4gbm8gY2FtZXJhcyBhcmUgZm91bmQsIHdpbGwgaW5qZWN0IGFuIGV4Y2VwdGlvbiAoaWYgYXZhaWxhYmxlKSB0byB0aGUgY2FsbGJhY2suXG4gICAqL1xuICBAT3V0cHV0KClcbiAgY2FtZXJhc05vdEZvdW5kOiBFdmVudEVtaXR0ZXI8YW55PjtcblxuICAvKipcbiAgICogRW1pdHMgZXZlbnRzIHdoZW4gdGhlIHVzZXJzIGFuc3dlcnMgZm9yIHBlcm1pc3Npb24uXG4gICAqL1xuICBAT3V0cHV0KClcbiAgcGVybWlzc2lvblJlc3BvbnNlOiBFdmVudEVtaXR0ZXI8Ym9vbGVhbj47XG5cbiAgLyoqXG4gICAqIEVtaXRzIGV2ZW50cyB3aGVuIGhhcyBkZXZpY2VzIHN0YXR1cyBpcyB1cGRhdGUuXG4gICAqL1xuICBAT3V0cHV0KClcbiAgaGFzRGV2aWNlczogRXZlbnRFbWl0dGVyPGJvb2xlYW4+O1xuXG4gIHByaXZhdGUgX3JlYWR5ID0gZmFsc2U7XG5cbiAgcHJpdmF0ZSBfZGV2aWNlUHJlU3RhcnQ6IE1lZGlhRGV2aWNlSW5mbztcblxuICAvKipcbiAgICogRXhwb3NlcyB0aGUgY3VycmVudCBjb2RlIHJlYWRlciwgc28gdGhlIHVzZXIgY2FuIHVzZSBpdCdzIEFQSXMuXG4gICAqL1xuICBnZXQgY29kZVJlYWRlcigpOiBCcm93c2VyTXVsdGlGb3JtYXRDb250aW51b3VzUmVhZGVyIHtcbiAgICByZXR1cm4gdGhpcy5fY29kZVJlYWRlcjtcbiAgfVxuXG4gIC8qKlxuICAgKiBVc2VyIGRldmljZSBpbnB1dFxuICAgKi9cbiAgQElucHV0KClcbiAgc2V0IGRldmljZShkZXZpY2U6IE1lZGlhRGV2aWNlSW5mbyB8IHVuZGVmaW5lZCkge1xuXG4gICAgaWYgKCF0aGlzLl9yZWFkeSkge1xuICAgICAgdGhpcy5fZGV2aWNlUHJlU3RhcnQgPSBkZXZpY2U7XG4gICAgICAvLyBsZXQncyBpZ25vcmUgc2lsZW50bHksIHVzZXJzIGRvbid0IGxpa2UgbG9nc1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGlmICh0aGlzLmlzQXV0b3N0YXJ0aW5nKSB7XG4gICAgICAvLyBkbyBub3QgYWxsb3cgc2V0dGluZyBkZXZpY2VzIGR1cmluZyBhdXRvLXN0YXJ0LCBzaW5jZSBpdCB3aWxsIHNldCBvbmUgYW5kIGVtaXQgaXQuXG4gICAgICBjb25zb2xlLndhcm4oJ0F2b2lkIHNldHRpbmcgYSBkZXZpY2UgZHVyaW5nIGF1dG8tc3RhcnQuJyk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgaWYgKHRoaXMuaXNDdXJyZW50RGV2aWNlKGRldmljZSkpIHtcbiAgICAgIGNvbnNvbGUud2FybignU2V0dGluZyB0aGUgc2FtZSBkZXZpY2UgaXMgbm90IGFsbG93ZWQuJyk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgaWYgKCF0aGlzLmhhc1Blcm1pc3Npb24pIHtcbiAgICAgIGNvbnNvbGUud2FybignUGVybWlzc2lvbnMgbm90IHNldCB5ZXQsIHdhaXRpbmcgZm9yIHRoZW0gdG8gYmUgc2V0IHRvIGFwcGx5IGRldmljZSBjaGFuZ2UuJyk7XG4gICAgICAvLyB0aGlzLnBlcm1pc3Npb25SZXNwb25zZVxuICAgICAgLy8gICAucGlwZShcbiAgICAgIC8vICAgICB0YWtlKDEpLFxuICAgICAgLy8gICAgIHRhcCgoKSA9PiBjb25zb2xlLmxvZyhgUGVybWlzc2lvbnMgc2V0LCBhcHBseWluZyBkZXZpY2UgY2hhbmdlJHtkZXZpY2UgPyBgICgke2RldmljZS5kZXZpY2VJZH0pYCA6ICcnfS5gKSlcbiAgICAgIC8vICAgKVxuICAgICAgLy8gICAuc3Vic2NyaWJlKCgpID0+IHRoaXMuZGV2aWNlID0gZGV2aWNlKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICB0aGlzLnNldERldmljZShkZXZpY2UpO1xuICB9XG5cbiAgLyoqXG4gICAqIEVtaXRzIHdoZW4gdGhlIGN1cnJlbnQgZGV2aWNlIGlzIGNoYW5nZWQuXG4gICAqL1xuICBAT3V0cHV0KClcbiAgZGV2aWNlQ2hhbmdlOiBFdmVudEVtaXR0ZXI8TWVkaWFEZXZpY2VJbmZvPjtcblxuICAvKipcbiAgICogVXNlciBkZXZpY2UgYWNjZXNzb3IuXG4gICAqL1xuICBnZXQgZGV2aWNlKCkge1xuICAgIHJldHVybiB0aGlzLl9kZXZpY2U7XG4gIH1cblxuICAvKipcbiAgICogUmV0dXJucyBhbGwgdGhlIHJlZ2lzdGVyZWQgZm9ybWF0cy5cbiAgICovXG4gIGdldCBmb3JtYXRzKCk6IEJhcmNvZGVGb3JtYXRbXSB7XG4gICAgcmV0dXJuIHRoaXMuaGludHMuZ2V0KERlY29kZUhpbnRUeXBlLlBPU1NJQkxFX0ZPUk1BVFMpO1xuICB9XG5cbiAgLyoqXG4gICAqIFJlZ2lzdGVycyBmb3JtYXRzIHRoZSBzY2FubmVyIHNob3VsZCBzdXBwb3J0LlxuICAgKlxuICAgKiBAcGFyYW0gaW5wdXQgQmFyY29kZUZvcm1hdCBvciBjYXNlLWluc2Vuc2l0aXZlIHN0cmluZyBhcnJheS5cbiAgICovXG4gIEBJbnB1dCgpXG4gIHNldCBmb3JtYXRzKGlucHV0OiBCYXJjb2RlRm9ybWF0W10pIHtcblxuICAgIGlmICh0eXBlb2YgaW5wdXQgPT09ICdzdHJpbmcnKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ0ludmFsaWQgZm9ybWF0cywgbWFrZSBzdXJlIHRoZSBbZm9ybWF0c10gaW5wdXQgaXMgYSBiaW5kaW5nLicpO1xuICAgIH1cblxuICAgIC8vIGZvcm1hdHMgbWF5IGJlIHNldCBmcm9tIGh0bWwgdGVtcGxhdGUgYXMgQmFyY29kZUZvcm1hdCBvciBzdHJpbmcgYXJyYXlcbiAgICBjb25zdCBmb3JtYXRzID0gaW5wdXQubWFwKGYgPT4gdGhpcy5nZXRCYXJjb2RlRm9ybWF0T3JGYWlsKGYpKTtcblxuICAgIGNvbnN0IGhpbnRzID0gdGhpcy5oaW50cztcblxuICAgIC8vIHVwZGF0ZXMgdGhlIGhpbnRzXG4gICAgaGludHMuc2V0KERlY29kZUhpbnRUeXBlLlBPU1NJQkxFX0ZPUk1BVFMsIGZvcm1hdHMpO1xuXG4gICAgLy8gaGFuZGxlcyB1cGRhdGluZyB0aGUgY29kZVJlYWRlclxuICAgIHRoaXMuaGludHMgPSBoaW50cztcbiAgfVxuXG4gIC8qKlxuICAgKiBSZXR1cm5zIGFsbCB0aGUgcmVnaXN0ZXJlZCBoaW50cy5cbiAgICovXG4gIGdldCBoaW50cygpIHtcbiAgICByZXR1cm4gdGhpcy5faGludHM7XG4gIH1cblxuICAvKipcbiAgICogRG9lcyB3aGF0IGl0IHRha2VzIHRvIHNldCB0aGUgaGludHMuXG4gICAqL1xuICBzZXQgaGludHMoaGludHM6IE1hcDxEZWNvZGVIaW50VHlwZSwgYW55Pikge1xuICAgIHRoaXMuX2hpbnRzID0gaGludHM7XG4gICAgLy8gbmV3IGluc3RhbmNlIHdpdGggbmV3IGhpbnRzLlxuICAgIHRoaXMuY29kZVJlYWRlcj8uc2V0SGludHModGhpcy5faGludHMpO1xuICB9XG5cbiAgLyoqXG4gICAqIFNldHMgdGhlIGRlc2lyZWQgY29uc3RyYWludHMgaW4gYWxsIHZpZGVvIHRyYWNrcy5cbiAgICogQGV4cGVyaW1lbnRhbFxuICAgKi9cbiAgQElucHV0KClcbiAgc2V0IHZpZGVvQ29uc3RyYWludHMoY29uc3RyYWludHM6IE1lZGlhVHJhY2tDb25zdHJhaW50cykge1xuICAgIC8vIG5ldyBpbnN0YW5jZSB3aXRoIG5ldyBoaW50cy5cbiAgICBjb25zdCBjb250cm9scyA9IHRoaXMuY29kZVJlYWRlcj8uZ2V0U2Nhbm5lckNvbnRyb2xzKCk7XG5cbiAgICBpZiAoIWNvbnRyb2xzKSB7XG4gICAgICAvLyBmYWlscyBzaWxlbnRseVxuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGNvbnRyb2xzPy5zdHJlYW1WaWRlb0NvbnN0cmFpbnRzQXBwbHkoY29uc3RyYWludHMpO1xuICB9XG5cbiAgLyoqXG4gICAqXG4gICAqL1xuICBzZXQgaXNBdXRvc3RhcnRpbmcoc3RhdGU6IGJvb2xlYW4pIHtcbiAgICB0aGlzLl9pc0F1dG9zdGFydGluZyA9IHN0YXRlO1xuICAgIHRoaXMuYXV0b3N0YXJ0aW5nLm5leHQoc3RhdGUpO1xuICB9XG5cbiAgLyoqXG4gICAqXG4gICAqL1xuICBnZXQgaXNBdXRvc3RhcnRpbmcoKTogYm9vbGVhbiB7XG4gICAgcmV0dXJuIHRoaXMuX2lzQXV0b3N0YXJ0aW5nO1xuICB9XG5cbiAgLyoqXG4gICAqIENhbiB0dXJuIG9uL29mZiB0aGUgZGV2aWNlIGZsYXNobGlnaHQuXG4gICAqXG4gICAqIEBleHBlcmltZW50YWwgVG9yY2gvRmxhc2ggQVBJcyBhcmUgbm90IHN0YWJsZSBpbiBhbGwgYnJvd3NlcnMsIGl0IG1heSBiZSBidWdneSFcbiAgICovXG4gIEBJbnB1dCgpXG4gIHNldCB0b3JjaChvbk9mZjogYm9vbGVhbikge1xuICAgIHRyeSB7XG4gICAgICBjb25zdCBjb250cm9scyA9IHRoaXMuZ2V0Q29kZVJlYWRlcigpLmdldFNjYW5uZXJDb250cm9scygpO1xuICAgICAgY29udHJvbHMuc3dpdGNoVG9yY2gob25PZmYpO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAvLyBpZ25vcmUgZXJyb3JcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogU3RhcnRzIGFuZCBTdG9wcyB0aGUgc2Nhbm5pbmcuXG4gICAqL1xuICBASW5wdXQoKVxuICBzZXQgZW5hYmxlKGVuYWJsZWQ6IGJvb2xlYW4pIHtcblxuICAgIHRoaXMuX2VuYWJsZWQgPSBCb29sZWFuKGVuYWJsZWQpO1xuXG4gICAgaWYgKCF0aGlzLl9lbmFibGVkKSB7XG4gICAgICB0aGlzLnJlc2V0KCk7XG4gICAgICBCcm93c2VyTXVsdGlGb3JtYXRDb250aW51b3VzUmVhZGVyLnJlbGVhc2VBbGxTdHJlYW1zKCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGlmICh0aGlzLmRldmljZSkge1xuICAgICAgICB0aGlzLnNjYW5Gcm9tRGV2aWNlKHRoaXMuZGV2aWNlLmRldmljZUlkKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRoaXMuaW5pdCgpO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBUZWxscyBpZiB0aGUgc2Nhbm5lciBpcyBlbmFibGVkIG9yIG5vdC5cbiAgICovXG4gIGdldCBlbmFibGVkKCk6IGJvb2xlYW4ge1xuICAgIHJldHVybiB0aGlzLl9lbmFibGVkO1xuICB9XG5cbiAgLyoqXG4gICAqIElmIGlzIGB0cnlIYXJkZXJgIGVuYWJsZWQuXG4gICAqL1xuICBnZXQgdHJ5SGFyZGVyKCk6IGJvb2xlYW4ge1xuICAgIHJldHVybiB0aGlzLmhpbnRzLmdldChEZWNvZGVIaW50VHlwZS5UUllfSEFSREVSKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBFbmFibGUvZGlzYWJsZSB0cnlIYXJkZXIgaGludC5cbiAgICovXG4gIEBJbnB1dCgpXG4gIHNldCB0cnlIYXJkZXIoZW5hYmxlOiBib29sZWFuKSB7XG5cbiAgICBjb25zdCBoaW50cyA9IHRoaXMuaGludHM7XG5cbiAgICBpZiAoZW5hYmxlKSB7XG4gICAgICBoaW50cy5zZXQoRGVjb2RlSGludFR5cGUuVFJZX0hBUkRFUiwgdHJ1ZSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGhpbnRzLmRlbGV0ZShEZWNvZGVIaW50VHlwZS5UUllfSEFSREVSKTtcbiAgICB9XG5cbiAgICB0aGlzLmhpbnRzID0gaGludHM7XG4gIH1cblxuICAvKipcbiAgICogQ29uc3RydWN0b3IgdG8gYnVpbGQgdGhlIG9iamVjdCBhbmQgZG8gc29tZSBESS5cbiAgICovXG4gIGNvbnN0cnVjdG9yKCkge1xuICAgIC8vIGluc3RhbmNlIGJhc2VkIGVtaXR0ZXJzXG4gICAgdGhpcy5hdXRvc3RhcnRlZCA9IG5ldyBFdmVudEVtaXR0ZXIoKTtcbiAgICB0aGlzLmF1dG9zdGFydGluZyA9IG5ldyBFdmVudEVtaXR0ZXIoKTtcbiAgICB0aGlzLnRvcmNoQ29tcGF0aWJsZSA9IG5ldyBFdmVudEVtaXR0ZXIoZmFsc2UpO1xuICAgIHRoaXMuc2NhblN1Y2Nlc3MgPSBuZXcgRXZlbnRFbWl0dGVyKCk7XG4gICAgdGhpcy5zY2FuRmFpbHVyZSA9IG5ldyBFdmVudEVtaXR0ZXIoKTtcbiAgICB0aGlzLnNjYW5FcnJvciA9IG5ldyBFdmVudEVtaXR0ZXIoKTtcbiAgICB0aGlzLnNjYW5Db21wbGV0ZSA9IG5ldyBFdmVudEVtaXR0ZXIoKTtcbiAgICB0aGlzLmNhbWVyYXNGb3VuZCA9IG5ldyBFdmVudEVtaXR0ZXIoKTtcbiAgICB0aGlzLmNhbWVyYXNOb3RGb3VuZCA9IG5ldyBFdmVudEVtaXR0ZXIoKTtcbiAgICB0aGlzLnBlcm1pc3Npb25SZXNwb25zZSA9IG5ldyBFdmVudEVtaXR0ZXIodHJ1ZSk7XG4gICAgdGhpcy5oYXNEZXZpY2VzID0gbmV3IEV2ZW50RW1pdHRlcigpO1xuICAgIHRoaXMuZGV2aWNlQ2hhbmdlID0gbmV3IEV2ZW50RW1pdHRlcigpO1xuXG4gICAgdGhpcy5fZW5hYmxlZCA9IHRydWU7XG4gICAgdGhpcy5faGludHMgPSBuZXcgTWFwPERlY29kZUhpbnRUeXBlLCBhbnk+KCk7XG4gICAgdGhpcy5hdXRvZm9jdXNFbmFibGVkID0gdHJ1ZTtcbiAgICB0aGlzLmF1dG9zdGFydCA9IHRydWU7XG4gICAgdGhpcy5mb3JtYXRzID0gW0JhcmNvZGVGb3JtYXQuUVJfQ09ERV07XG5cbiAgICAvLyBjb21wdXRlZCBkYXRhXG4gICAgdGhpcy5oYXNOYXZpZ2F0b3IgPSB0eXBlb2YgbmF2aWdhdG9yICE9PSAndW5kZWZpbmVkJztcbiAgICB0aGlzLmlzTWVkaWFEZXZpY2VzU3VwcG9ydGVkID0gdGhpcy5oYXNOYXZpZ2F0b3IgJiYgISFuYXZpZ2F0b3IubWVkaWFEZXZpY2VzO1xuICB9XG5cbiAgLyoqXG4gICAqIEdldHMgYW5kIHJlZ2lzdGVycyBhbGwgY2FtZXJhcy5cbiAgICovXG4gIGFzeW5jIGFza0ZvclBlcm1pc3Npb24oKTogUHJvbWlzZTxib29sZWFuPiB7XG5cbiAgICBpZiAoIXRoaXMuaGFzTmF2aWdhdG9yKSB7XG4gICAgICBjb25zb2xlLmVycm9yKCdAenhpbmcvbmd4LXNjYW5uZXInLCAnQ2FuXFwndCBhc2sgcGVybWlzc2lvbiwgbmF2aWdhdG9yIGlzIG5vdCBwcmVzZW50LicpO1xuICAgICAgdGhpcy5zZXRQZXJtaXNzaW9uKG51bGwpO1xuICAgICAgcmV0dXJuIHRoaXMuaGFzUGVybWlzc2lvbjtcbiAgICB9XG5cbiAgICBpZiAoIXRoaXMuaXNNZWRpYURldmljZXNTdXBwb3J0ZWQpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoJ0B6eGluZy9uZ3gtc2Nhbm5lcicsICdDYW5cXCd0IGdldCB1c2VyIG1lZGlhLCB0aGlzIGlzIG5vdCBzdXBwb3J0ZWQuJyk7XG4gICAgICB0aGlzLnNldFBlcm1pc3Npb24obnVsbCk7XG4gICAgICByZXR1cm4gdGhpcy5oYXNQZXJtaXNzaW9uO1xuICAgIH1cblxuICAgIGxldCBzdHJlYW06IE1lZGlhU3RyZWFtO1xuICAgIGxldCBwZXJtaXNzaW9uOiBib29sZWFuO1xuXG4gICAgdHJ5IHtcbiAgICAgIC8vIFdpbGwgdHJ5IHRvIGFzayBmb3IgcGVybWlzc2lvblxuICAgICAgc3RyZWFtID0gYXdhaXQgdGhpcy5nZXRBbnlWaWRlb0RldmljZSgpO1xuICAgICAgcGVybWlzc2lvbiA9ICEhc3RyZWFtO1xuICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlUGVybWlzc2lvbkV4Y2VwdGlvbihlcnIpO1xuICAgIH0gZmluYWxseSB7XG4gICAgICB0aGlzLnRlcm1pbmF0ZVN0cmVhbShzdHJlYW0pO1xuICAgIH1cblxuICAgIHRoaXMuc2V0UGVybWlzc2lvbihwZXJtaXNzaW9uKTtcblxuICAgIC8vIFJldHVybnMgdGhlIHBlcm1pc3Npb25cbiAgICByZXR1cm4gcGVybWlzc2lvbjtcbiAgfVxuXG4gIC8qKlxuICAgKlxuICAgKi9cbiAgZ2V0QW55VmlkZW9EZXZpY2UoKTogUHJvbWlzZTxNZWRpYVN0cmVhbT4ge1xuICAgIHJldHVybiBuYXZpZ2F0b3IubWVkaWFEZXZpY2VzLmdldFVzZXJNZWRpYSh7IHZpZGVvOiB0cnVlIH0pO1xuICB9XG5cbiAgLyoqXG4gICAqIFRlcm1pbmF0ZXMgYSBzdHJlYW0gYW5kIGl0J3MgdHJhY2tzLlxuICAgKi9cbiAgcHJpdmF0ZSB0ZXJtaW5hdGVTdHJlYW0oc3RyZWFtOiBNZWRpYVN0cmVhbSkge1xuXG4gICAgaWYgKHN0cmVhbSkge1xuICAgICAgc3RyZWFtLmdldFRyYWNrcygpLmZvckVhY2godCA9PiB0LnN0b3AoKSk7XG4gICAgfVxuXG4gICAgc3RyZWFtID0gdW5kZWZpbmVkO1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBpbml0KCkge1xuICAgIGlmICghdGhpcy5hdXRvc3RhcnQpIHtcbiAgICAgIGNvbnNvbGUud2FybignRmVhdHVyZSBcXCdhdXRvc3RhcnRcXCcgZGlzYWJsZWQuIFBlcm1pc3Npb25zIGFuZCBkZXZpY2VzIHJlY292ZXJ5IGhhcyB0byBiZSBydW4gbWFudWFsbHkuJyk7XG5cbiAgICAgIC8vIGRvZXMgdGhlIG5lY2Vzc2FyeSBjb25maWd1cmF0aW9uIHdpdGhvdXQgYXV0b3N0YXJ0aW5nXG4gICAgICB0aGlzLmluaXRBdXRvc3RhcnRPZmYoKTtcblxuICAgICAgdGhpcy5fcmVhZHkgPSB0cnVlO1xuXG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgLy8gY29uZmlndXJlcyB0aGUgY29tcG9uZW50IGFuZCBzdGFydHMgdGhlIHNjYW5uZXJcbiAgICBhd2FpdCB0aGlzLmluaXRBdXRvc3RhcnRPbigpO1xuXG4gICAgdGhpcy5fcmVhZHkgPSB0cnVlO1xuICB9XG5cbiAgLyoqXG4gICAqIEluaXRpYWxpemVzIHRoZSBjb21wb25lbnQgd2l0aG91dCBzdGFydGluZyB0aGUgc2Nhbm5lci5cbiAgICovXG4gIHByaXZhdGUgaW5pdEF1dG9zdGFydE9mZigpOiB2b2lkIHtcblxuICAgIC8vIGRvIG5vdCBhc2sgZm9yIHBlcm1pc3Npb24gd2hlbiBhdXRvc3RhcnQgaXMgb2ZmXG4gICAgdGhpcy5pc0F1dG9zdGFydGluZyA9IGZhbHNlO1xuXG4gICAgLy8ganVzdCB1cGRhdGUgZGV2aWNlcyBpbmZvcm1hdGlvblxuICAgIHRoaXMudXBkYXRlVmlkZW9JbnB1dERldmljZXMoKTtcblxuICAgIGlmICh0aGlzLl9kZXZpY2UgJiYgdGhpcy5fZGV2aWNlUHJlU3RhcnQpIHtcbiAgICAgIHRoaXMuc2V0RGV2aWNlKHRoaXMuX2RldmljZVByZVN0YXJ0KTtcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogSW5pdGlhbGl6ZXMgdGhlIGNvbXBvbmVudCBhbmQgc3RhcnRzIHRoZSBzY2FubmVyLlxuICAgKiBQZXJtaXNzaW9ucyBhcmUgYXNrZWQgdG8gYWNjb21wbGlzaCB0aGF0LlxuICAgKi9cbiAgcHJpdmF0ZSBhc3luYyBpbml0QXV0b3N0YXJ0T24oKTogUHJvbWlzZTx2b2lkPiB7XG5cbiAgICB0aGlzLmlzQXV0b3N0YXJ0aW5nID0gdHJ1ZTtcblxuICAgIGxldCBoYXNQZXJtaXNzaW9uOiBib29sZWFuO1xuXG4gICAgdHJ5IHtcbiAgICAgIC8vIEFza3MgZm9yIHBlcm1pc3Npb24gYmVmb3JlIGVudW1lcmF0aW5nIGRldmljZXMgc28gaXQgY2FuIGdldCBhbGwgdGhlIGRldmljZSdzIGluZm9cbiAgICAgIGhhc1Blcm1pc3Npb24gPSBhd2FpdCB0aGlzLmFza0ZvclBlcm1pc3Npb24oKTtcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICBjb25zb2xlLmVycm9yKCdFeGNlcHRpb24gb2NjdXJyZWQgd2hpbGUgYXNraW5nIGZvciBwZXJtaXNzaW9uOicsIGUpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIC8vIGZyb20gdGhpcyBwb2ludCwgdGhpbmdzIGdvbm5hIG5lZWQgcGVybWlzc2lvbnNcbiAgICBpZiAoaGFzUGVybWlzc2lvbikge1xuICAgICAgY29uc3QgZGV2aWNlcyA9IGF3YWl0IHRoaXMudXBkYXRlVmlkZW9JbnB1dERldmljZXMoKTtcbiAgICAgIGF3YWl0IHRoaXMuYXV0b3N0YXJ0U2Nhbm5lcihbLi4uZGV2aWNlc10pO1xuICAgIH1cblxuICAgIHRoaXMuaXNBdXRvc3RhcnRpbmcgPSBmYWxzZTtcbiAgICB0aGlzLmF1dG9zdGFydGVkLm5leHQoKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBDaGVja3MgaWYgdGhlIGdpdmVuIGRldmljZSBpcyB0aGUgY3VycmVudCBkZWZpbmVkIG9uZS5cbiAgICovXG4gIGlzQ3VycmVudERldmljZShkZXZpY2U/OiBNZWRpYURldmljZUluZm8pIHtcbiAgICByZXR1cm4gZGV2aWNlPy5kZXZpY2VJZCA9PT0gdGhpcy5fZGV2aWNlPy5kZXZpY2VJZDtcbiAgfVxuXG4gIC8qKlxuICAgKiBFeGVjdXRlcyBzb21lIGFjdGlvbnMgYmVmb3JlIGRlc3Ryb3kgdGhlIGNvbXBvbmVudC5cbiAgICovXG4gIG5nT25EZXN0cm95KCk6IHZvaWQge1xuICAgIHRoaXMucmVzZXQoKTtcbiAgICBCcm93c2VyTXVsdGlGb3JtYXRDb250aW51b3VzUmVhZGVyLnJlbGVhc2VBbGxTdHJlYW1zKCk7XG4gIH1cblxuICAvKipcbiAgICpcbiAgICovXG4gIG5nT25Jbml0KCk6IHZvaWQge1xuICAgIHRoaXMuaW5pdCgpO1xuICB9XG5cbiAgLyoqXG4gICAqIFN0b3BzIHRoZSBzY2FubmluZywgaWYgYW55LlxuICAgKi9cbiAgcHVibGljIHNjYW5TdG9wKCkge1xuICAgIGlmICh0aGlzLl9zY2FuU3Vic2NyaXB0aW9uKSB7XG4gICAgICB0aGlzLmNvZGVSZWFkZXI/LmdldFNjYW5uZXJDb250cm9scygpLnN0b3AoKTtcbiAgICAgIHRoaXMuX3NjYW5TdWJzY3JpcHRpb24/LnVuc3Vic2NyaWJlKCk7XG4gICAgICB0aGlzLl9zY2FuU3Vic2NyaXB0aW9uID0gdW5kZWZpbmVkO1xuICAgIH1cbiAgICB0aGlzLnRvcmNoQ29tcGF0aWJsZS5uZXh0KGZhbHNlKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBTdG9wcyB0aGUgc2Nhbm5pbmcsIGlmIGFueS5cbiAgICovXG4gIHB1YmxpYyBzY2FuU3RhcnQoKSB7XG5cbiAgICBpZiAodGhpcy5fc2NhblN1YnNjcmlwdGlvbikge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdUaGVyZSBpcyBhbHJlYWR5IGEgc2NhbiBwcm9jZXNzIHJ1bm5pbmcuJyk7XG4gICAgfVxuXG4gICAgaWYgKCF0aGlzLl9kZXZpY2UpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignTm8gZGV2aWNlIGRlZmluZWQsIGNhbm5vdCBzdGFydCBzY2FuLCBwbGVhc2UgZGVmaW5lIGEgZGV2aWNlLicpO1xuICAgIH1cblxuICAgIHRoaXMuc2NhbkZyb21EZXZpY2UodGhpcy5fZGV2aWNlLmRldmljZUlkKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBTdG9wcyBvbGQgYGNvZGVSZWFkZXJgIGFuZCBzdGFydHMgc2Nhbm5pbmcgaW4gYSBuZXcgb25lLlxuICAgKi9cbiAgcmVzdGFydCgpOiB2b2lkIHtcbiAgICAvLyBub3RlIG9ubHkgbmVjZXNzYXJ5IGZvciBub3cgYmVjYXVzZSBvZiB0aGUgVG9yY2hcbiAgICB0aGlzLl9jb2RlUmVhZGVyID0gdW5kZWZpbmVkO1xuXG4gICAgY29uc3QgcHJldkRldmljZSA9IHRoaXMuX3Jlc2V0KCk7XG5cbiAgICBpZiAoIXByZXZEZXZpY2UpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICB0aGlzLmRldmljZSA9IHByZXZEZXZpY2U7XG4gIH1cblxuICAvKipcbiAgICogRGlzY292ZXJzIGFuZCB1cGRhdGVzIGtub3duIHZpZGVvIGlucHV0IGRldmljZXMuXG4gICAqL1xuICBhc3luYyB1cGRhdGVWaWRlb0lucHV0RGV2aWNlcygpOiBQcm9taXNlPE1lZGlhRGV2aWNlSW5mb1tdPiB7XG5cbiAgICAvLyBwZXJtaXNzaW9ucyBhcmVuJ3QgbmVlZGVkIHRvIGdldCBkZXZpY2VzLCBidXQgdG8gYWNjZXNzIHRoZW0gYW5kIHRoZWlyIGluZm9cbiAgICBjb25zdCBkZXZpY2VzID0gYXdhaXQgQnJvd3NlckNvZGVSZWFkZXIubGlzdFZpZGVvSW5wdXREZXZpY2VzKCkgfHwgW107XG4gICAgY29uc3QgaGFzRGV2aWNlcyA9IGRldmljZXMgJiYgZGV2aWNlcy5sZW5ndGggPiAwO1xuXG4gICAgLy8gc3RvcmVzIGRpc2NvdmVyZWQgZGV2aWNlcyBhbmQgdXBkYXRlcyBpbmZvcm1hdGlvblxuICAgIHRoaXMuaGFzRGV2aWNlcy5uZXh0KGhhc0RldmljZXMpO1xuICAgIHRoaXMuY2FtZXJhc0ZvdW5kLm5leHQoWy4uLmRldmljZXNdKTtcblxuICAgIGlmICghaGFzRGV2aWNlcykge1xuICAgICAgdGhpcy5jYW1lcmFzTm90Rm91bmQubmV4dChudWxsKTtcbiAgICB9XG5cbiAgICByZXR1cm4gZGV2aWNlcztcbiAgfVxuXG4gIC8qKlxuICAgKiBTdGFydHMgdGhlIHNjYW5uZXIgd2l0aCB0aGUgYmFjayBjYW1lcmEgb3RoZXJ3aXNlIHRha2UgdGhlIGxhc3RcbiAgICogYXZhaWxhYmxlIGRldmljZS5cbiAgICovXG4gIHByaXZhdGUgYXN5bmMgYXV0b3N0YXJ0U2Nhbm5lcihkZXZpY2VzOiBNZWRpYURldmljZUluZm9bXSk6IFByb21pc2U8dm9pZD4ge1xuXG4gICAgY29uc3QgbWF0Y2hlciA9ICh7IGxhYmVsIH0pID0+IC9iYWNrfHRyw6FzfHJlYXJ8dHJhc2VpcmF8ZW52aXJvbm1lbnR8YW1iaWVudGUvZ2kudGVzdChsYWJlbCk7XG5cbiAgICAvLyBzZWxlY3QgdGhlIHJlYXIgY2FtZXJhIGJ5IGRlZmF1bHQsIG90aGVyd2lzZSB0YWtlIHRoZSBsYXN0IGNhbWVyYS5cbiAgICBjb25zdCBkZXZpY2UgPSBkZXZpY2VzLmZpbmQobWF0Y2hlcikgfHwgZGV2aWNlcy5wb3AoKTtcblxuICAgIGlmICghZGV2aWNlKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ0ltcG9zc2libGUgdG8gYXV0b3N0YXJ0LCBubyBpbnB1dCBkZXZpY2VzIGF2YWlsYWJsZS4nKTtcbiAgICB9XG5cbiAgICBhd2FpdCB0aGlzLnNldERldmljZShkZXZpY2UpO1xuXG4gICAgdGhpcy5kZXZpY2VDaGFuZ2UubmV4dChkZXZpY2UpO1xuICB9XG5cbiAgLyoqXG4gICAqIERpc3BhdGNoZXMgdGhlIHNjYW4gc3VjY2VzcyBldmVudC5cbiAgICpcbiAgICogQHBhcmFtIHJlc3VsdCB0aGUgc2NhbiByZXN1bHQuXG4gICAqL1xuICBwcml2YXRlIGRpc3BhdGNoU2NhblN1Y2Nlc3MocmVzdWx0OiBSZXN1bHQpOiB2b2lkIHtcbiAgICB0aGlzLnNjYW5TdWNjZXNzLm5leHQocmVzdWx0LmdldFRleHQoKSk7XG4gIH1cblxuICAvKipcbiAgICogRGlzcGF0Y2hlcyB0aGUgc2NhbiBmYWlsdXJlIGV2ZW50LlxuICAgKi9cbiAgcHJpdmF0ZSBkaXNwYXRjaFNjYW5GYWlsdXJlKHJlYXNvbj86IEV4Y2VwdGlvbik6IHZvaWQge1xuICAgIHRoaXMuc2NhbkZhaWx1cmUubmV4dChyZWFzb24pO1xuICB9XG5cbiAgLyoqXG4gICAqIERpc3BhdGNoZXMgdGhlIHNjYW4gZXJyb3IgZXZlbnQuXG4gICAqXG4gICAqIEBwYXJhbSBlcnJvciB0aGUgZXJyb3IgdGhpbmcuXG4gICAqL1xuICBwcml2YXRlIGRpc3BhdGNoU2NhbkVycm9yKGVycm9yOiBhbnkpOiB2b2lkIHtcbiAgICBpZiAoIXRoaXMuc2NhbkVycm9yLm9ic2VydmVkKSB7XG4gICAgICBjb25zb2xlLmVycm9yKGB6eGluZyBzY2FubmVyIGNvbXBvbmVudDogJHtlcnJvci5uYW1lfWAsIGVycm9yKTtcbiAgICAgIGNvbnNvbGUud2FybignVXNlIHRoZSBgKHNjYW5FcnJvcilgIHByb3BlcnR5IHRvIGhhbmRsZSBlcnJvcnMgbGlrZSB0aGlzIScpO1xuICAgIH1cbiAgICB0aGlzLnNjYW5FcnJvci5uZXh0KGVycm9yKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBEaXNwYXRjaGVzIHRoZSBzY2FuIGV2ZW50LlxuICAgKlxuICAgKiBAcGFyYW0gcmVzdWx0IHRoZSBzY2FuIHJlc3VsdC5cbiAgICovXG4gIHByaXZhdGUgZGlzcGF0Y2hTY2FuQ29tcGxldGUocmVzdWx0OiBSZXN1bHQpOiB2b2lkIHtcbiAgICB0aGlzLnNjYW5Db21wbGV0ZS5uZXh0KHJlc3VsdCk7XG4gIH1cblxuICAvKipcbiAgICogUmV0dXJucyB0aGUgZmlsdGVyZWQgcGVybWlzc2lvbi5cbiAgICovXG4gIHByaXZhdGUgaGFuZGxlUGVybWlzc2lvbkV4Y2VwdGlvbihlcnI6IERPTUV4Y2VwdGlvbik6IGJvb2xlYW4ge1xuXG4gICAgLy8gZmFpbGVkIHRvIGdyYW50IHBlcm1pc3Npb24gdG8gdmlkZW8gaW5wdXRcbiAgICBjb25zb2xlLmVycm9yKCdAenhpbmcvbmd4LXNjYW5uZXInLCAnRXJyb3Igd2hlbiBhc2tpbmcgZm9yIHBlcm1pc3Npb24uJywgZXJyKTtcblxuICAgIGxldCBwZXJtaXNzaW9uOiBib29sZWFuO1xuXG4gICAgc3dpdGNoIChlcnIubmFtZSkge1xuXG4gICAgICAvLyB1c3VhbGx5IGNhdXNlZCBieSBub3Qgc2VjdXJlIG9yaWdpbnNcbiAgICAgIGNhc2UgJ05vdFN1cHBvcnRlZEVycm9yJzpcbiAgICAgICAgY29uc29sZS53YXJuKCdAenhpbmcvbmd4LXNjYW5uZXInLCBlcnIubWVzc2FnZSk7XG4gICAgICAgIC8vIGNvdWxkIG5vdCBjbGFpbVxuICAgICAgICBwZXJtaXNzaW9uID0gbnVsbDtcbiAgICAgICAgLy8gY2FuJ3QgY2hlY2sgZGV2aWNlc1xuICAgICAgICB0aGlzLmhhc0RldmljZXMubmV4dChudWxsKTtcbiAgICAgICAgYnJlYWs7XG5cbiAgICAgIC8vIHVzZXIgZGVuaWVkIHBlcm1pc3Npb25cbiAgICAgIGNhc2UgJ05vdEFsbG93ZWRFcnJvcic6XG4gICAgICAgIGNvbnNvbGUud2FybignQHp4aW5nL25neC1zY2FubmVyJywgZXJyLm1lc3NhZ2UpO1xuICAgICAgICAvLyBjbGFpbWVkIGFuZCBkZW5pZWQgcGVybWlzc2lvblxuICAgICAgICBwZXJtaXNzaW9uID0gZmFsc2U7XG4gICAgICAgIC8vIHRoaXMgbWVhbnMgdGhhdCBpbnB1dCBkZXZpY2VzIGV4aXN0c1xuICAgICAgICB0aGlzLmhhc0RldmljZXMubmV4dCh0cnVlKTtcbiAgICAgICAgYnJlYWs7XG5cbiAgICAgIC8vIHRoZSBkZXZpY2UgaGFzIG5vIGF0dGFjaGVkIGlucHV0IGRldmljZXNcbiAgICAgIGNhc2UgJ05vdEZvdW5kRXJyb3InOlxuICAgICAgICBjb25zb2xlLndhcm4oJ0B6eGluZy9uZ3gtc2Nhbm5lcicsIGVyci5tZXNzYWdlKTtcbiAgICAgICAgLy8gbm8gcGVybWlzc2lvbnMgY2xhaW1lZFxuICAgICAgICBwZXJtaXNzaW9uID0gbnVsbDtcbiAgICAgICAgLy8gYmVjYXVzZSB0aGVyZSB3YXMgbm8gZGV2aWNlc1xuICAgICAgICB0aGlzLmhhc0RldmljZXMubmV4dChmYWxzZSk7XG4gICAgICAgIC8vIHRlbGxzIHRoZSBsaXN0ZW5lciBhYm91dCB0aGUgZXJyb3JcbiAgICAgICAgdGhpcy5jYW1lcmFzTm90Rm91bmQubmV4dChlcnIpO1xuICAgICAgICBicmVhaztcblxuICAgICAgY2FzZSAnTm90UmVhZGFibGVFcnJvcic6XG4gICAgICAgIGNvbnNvbGUud2FybignQHp4aW5nL25neC1zY2FubmVyJywgJ0NvdWxkblxcJ3QgcmVhZCB0aGUgZGV2aWNlKHMpXFwncyBzdHJlYW0sIGl0XFwncyBwcm9iYWJseSBpbiB1c2UgYnkgYW5vdGhlciBhcHAuJyk7XG4gICAgICAgIC8vIG5vIHBlcm1pc3Npb25zIGNsYWltZWRcbiAgICAgICAgcGVybWlzc2lvbiA9IG51bGw7XG4gICAgICAgIC8vIHRoZXJlIGFyZSBkZXZpY2VzLCB3aGljaCBJIGNvdWxkbid0IHVzZVxuICAgICAgICB0aGlzLmhhc0RldmljZXMubmV4dChmYWxzZSk7XG4gICAgICAgIC8vIHRlbGxzIHRoZSBsaXN0ZW5lciBhYm91dCB0aGUgZXJyb3JcbiAgICAgICAgdGhpcy5jYW1lcmFzTm90Rm91bmQubmV4dChlcnIpO1xuICAgICAgICBicmVhaztcblxuICAgICAgZGVmYXVsdDpcbiAgICAgICAgY29uc29sZS53YXJuKCdAenhpbmcvbmd4LXNjYW5uZXInLCAnSSB3YXMgbm90IGFibGUgdG8gZGVmaW5lIGlmIEkgaGF2ZSBwZXJtaXNzaW9ucyBmb3IgY2FtZXJhIG9yIG5vdC4nLCBlcnIpO1xuICAgICAgICAvLyB1bmtub3duXG4gICAgICAgIHBlcm1pc3Npb24gPSBudWxsO1xuICAgICAgICAvLyB0aGlzLmhhc0RldmljZXMubmV4dCh1bmRlZmluZWQ7XG4gICAgICAgIGJyZWFrO1xuXG4gICAgfVxuXG4gICAgdGhpcy5zZXRQZXJtaXNzaW9uKHBlcm1pc3Npb24pO1xuXG4gICAgLy8gdGVsbHMgdGhlIGxpc3RlbmVyIGFib3V0IHRoZSBlcnJvclxuICAgIHRoaXMucGVybWlzc2lvblJlc3BvbnNlLmVycm9yKGVycik7XG5cbiAgICByZXR1cm4gcGVybWlzc2lvbjtcbiAgfVxuXG4gIC8qKlxuICAgKiBSZXR1cm5zIGEgdmFsaWQgQmFyY29kZUZvcm1hdCBvciBmYWlscy5cbiAgICovXG4gIHByaXZhdGUgZ2V0QmFyY29kZUZvcm1hdE9yRmFpbChmb3JtYXQ6IHN0cmluZyB8IEJhcmNvZGVGb3JtYXQpOiBCYXJjb2RlRm9ybWF0IHtcbiAgICByZXR1cm4gdHlwZW9mIGZvcm1hdCA9PT0gJ3N0cmluZydcbiAgICAgID8gQmFyY29kZUZvcm1hdFtmb3JtYXQudHJpbSgpLnRvVXBwZXJDYXNlKCldXG4gICAgICA6IGZvcm1hdDtcbiAgfVxuXG4gIC8qKlxuICAgKiBSZXR1cm4gYSBjb2RlIHJlYWRlciwgY3JlYXRlIG9uZSBpZiBub24gZXhpc3RcbiAgICovXG4gIHByaXZhdGUgZ2V0Q29kZVJlYWRlcigpOiBCcm93c2VyTXVsdGlGb3JtYXRDb250aW51b3VzUmVhZGVyIHtcblxuICAgIGlmICghdGhpcy5fY29kZVJlYWRlcikge1xuICAgICAgY29uc3Qgb3B0aW9ucyA9IHtcbiAgICAgICAgZGVsYXlCZXR3ZWVuU2NhbkF0dGVtcHRzOiB0aGlzLnRpbWVCZXR3ZWVuU2NhbnMsXG4gICAgICAgIGRlbGF5QmV0d2VlblNjYW5TdWNjZXNzOiB0aGlzLmRlbGF5QmV0d2VlblNjYW5TdWNjZXNzLFxuICAgICAgfTtcbiAgICAgIHRoaXMuX2NvZGVSZWFkZXIgPSBuZXcgQnJvd3Nlck11bHRpRm9ybWF0Q29udGludW91c1JlYWRlcih0aGlzLmhpbnRzLCBvcHRpb25zKTtcbiAgICB9XG5cbiAgICByZXR1cm4gdGhpcy5fY29kZVJlYWRlcjtcbiAgfVxuXG4gIC8qKlxuICAgKiBTdGFydHMgdGhlIGNvbnRpbnVvdXMgc2Nhbm5pbmcgZm9yIHRoZSBnaXZlbiBkZXZpY2UuXG4gICAqXG4gICAqIEBwYXJhbSBkZXZpY2VJZCBUaGUgZGV2aWNlSWQgZnJvbSB0aGUgZGV2aWNlLlxuICAgKi9cbiAgcHJpdmF0ZSBhc3luYyBzY2FuRnJvbURldmljZShkZXZpY2VJZDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cbiAgICBjb25zdCB2aWRlb0VsZW1lbnQgPSB0aGlzLnByZXZpZXdFbGVtUmVmLm5hdGl2ZUVsZW1lbnQ7XG5cbiAgICBjb25zdCBjb2RlUmVhZGVyID0gdGhpcy5nZXRDb2RlUmVhZGVyKCk7XG5cbiAgICBjb25zdCBzY2FuU3RyZWFtID0gYXdhaXQgY29kZVJlYWRlci5zY2FuRnJvbURldmljZU9ic2VydmFibGUoZGV2aWNlSWQsIHZpZGVvRWxlbWVudCk7XG5cbiAgICBpZiAoIXNjYW5TdHJlYW0pIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignVW5kZWZpbmVkIGRlY29kaW5nIHN0cmVhbSwgYWJvcnRpbmcuJyk7XG4gICAgfVxuXG4gICAgY29uc3QgbmV4dCA9ICh4OiBSZXN1bHRBbmRFcnJvcikgPT4gdGhpcy5fb25EZWNvZGVSZXN1bHQoeC5yZXN1bHQsIHguZXJyb3IpO1xuICAgIGNvbnN0IGVycm9yID0gKGVycjogYW55KSA9PiB0aGlzLl9vbkRlY29kZUVycm9yKGVycik7XG4gICAgY29uc3QgY29tcGxldGUgPSAoKSA9PiB7IH07XG5cbiAgICB0aGlzLl9zY2FuU3Vic2NyaXB0aW9uID0gc2NhblN0cmVhbS5zdWJzY3JpYmUobmV4dCwgZXJyb3IsIGNvbXBsZXRlKTtcblxuICAgIGlmICh0aGlzLl9zY2FuU3Vic2NyaXB0aW9uLmNsb3NlZCkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGNvbnN0IGNvbnRyb2xzID0gY29kZVJlYWRlci5nZXRTY2FubmVyQ29udHJvbHMoKTtcbiAgICBjb25zdCBoYXNUb3JjaENvbnRyb2wgPSB0eXBlb2YgY29udHJvbHMuc3dpdGNoVG9yY2ggIT09ICd1bmRlZmluZWQnO1xuXG4gICAgdGhpcy50b3JjaENvbXBhdGlibGUubmV4dChoYXNUb3JjaENvbnRyb2wpO1xuICB9XG5cbiAgLyoqXG4gICAqIEhhbmRsZXMgZGVjb2RlIGVycm9ycy5cbiAgICovXG4gIHByaXZhdGUgX29uRGVjb2RlRXJyb3IoZXJyOiBhbnkpIHtcbiAgICB0aGlzLmRpc3BhdGNoU2NhbkVycm9yKGVycik7XG4gICAgLy8gdGhpcy5yZXNldCgpO1xuICB9XG5cbiAgLyoqXG4gICAqIEhhbmRsZXMgZGVjb2RlIHJlc3VsdHMuXG4gICAqL1xuICBwcml2YXRlIF9vbkRlY29kZVJlc3VsdChyZXN1bHQ6IFJlc3VsdCwgZXJyb3I6IEV4Y2VwdGlvbik6IHZvaWQge1xuXG4gICAgaWYgKHJlc3VsdCkge1xuICAgICAgdGhpcy5kaXNwYXRjaFNjYW5TdWNjZXNzKHJlc3VsdCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHRoaXMuZGlzcGF0Y2hTY2FuRmFpbHVyZShlcnJvcik7XG4gICAgfVxuXG4gICAgdGhpcy5kaXNwYXRjaFNjYW5Db21wbGV0ZShyZXN1bHQpO1xuICB9XG5cbiAgLyoqXG4gICAqIFN0b3BzIHRoZSBjb2RlIHJlYWRlciBhbmQgcmV0dXJucyB0aGUgcHJldmlvdXMgc2VsZWN0ZWQgZGV2aWNlLlxuICAgKi9cbiAgcHJpdmF0ZSBfcmVzZXQoKTogTWVkaWFEZXZpY2VJbmZvIHtcblxuICAgIGlmICghdGhpcy5fY29kZVJlYWRlcikge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIC8vIGNsZWFyaW5nIGNvZGVSZWFkZXIgZmlyc3QgdG8gcHJldmVudCBzZXRPcHRpb25zIGVycm9yIGFwcGVhcmluZyBpbiBzZXZlcmFsIENocm9taXVtIHZlcnNpb25zXG4gICAgdGhpcy5fY29kZVJlYWRlciA9IHVuZGVmaW5lZDtcblxuICAgIGNvbnN0IGRldmljZSA9IHRoaXMuX2RldmljZTtcbiAgICAvLyBkbyBub3Qgc2V0IHRoaXMuZGV2aWNlIGluc2lkZSB0aGlzIG1ldGhvZCwgaXQgd291bGQgY3JlYXRlIGEgcmVjdXJzaXZlIGxvb3BcbiAgICB0aGlzLmRldmljZSA9IHVuZGVmaW5lZDtcblxuXG4gICAgcmV0dXJuIGRldmljZTtcbiAgfVxuXG4gIC8qKlxuICAgKiBSZXNldHMgdGhlIHNjYW5uZXIgYW5kIGVtaXRzIGRldmljZSBjaGFuZ2UuXG4gICAqL1xuICBwdWJsaWMgcmVzZXQoKTogdm9pZCB7XG4gICAgdGhpcy5fcmVzZXQoKTtcbiAgICB0aGlzLmRldmljZUNoYW5nZS5lbWl0KG51bGwpO1xuICB9XG5cbiAgLyoqXG4gICAqIFNldHMgdGhlIGN1cnJlbnQgZGV2aWNlLlxuICAgKi9cbiAgcHJpdmF0ZSBhc3luYyBzZXREZXZpY2UoZGV2aWNlOiBNZWRpYURldmljZUluZm8pOiBQcm9taXNlPHZvaWQ+IHtcblxuICAgIC8vIGluc3RhbnRseSBzdG9wcyB0aGUgc2NhbiBiZWZvcmUgY2hhbmdpbmcgZGV2aWNlc1xuICAgIHRoaXMuc2NhblN0b3AoKTtcblxuICAgIC8vIGNvcnJlY3RseSBzZXRzIHRoZSBuZXcgKG9yIG5vbmUpIGRldmljZVxuICAgIHRoaXMuX2RldmljZSA9IGRldmljZSB8fCB1bmRlZmluZWQ7XG5cbiAgICBpZiAoIXRoaXMuX2RldmljZSkge1xuICAgICAgLy8gY2xlYW5zIHRoZSB2aWRlbyBiZWNhdXNlIHVzZXIgcmVtb3ZlZCB0aGUgZGV2aWNlXG4gICAgICBCcm93c2VyQ29kZVJlYWRlci5jbGVhblZpZGVvU291cmNlKHRoaXMucHJldmlld0VsZW1SZWYubmF0aXZlRWxlbWVudCk7XG4gICAgfVxuXG4gICAgLy8gaWYgZW5hYmxlZCwgc3RhcnRzIHNjYW5uaW5nXG4gICAgaWYgKHRoaXMuX2VuYWJsZWQgJiYgZGV2aWNlKSB7XG4gICAgICBhd2FpdCB0aGlzLnNjYW5Gcm9tRGV2aWNlKGRldmljZS5kZXZpY2VJZCk7XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIFNldHMgdGhlIHBlcm1pc3Npb24gdmFsdWUgYW5kIGVtaXRzIHRoZSBldmVudC5cbiAgICovXG4gIHByaXZhdGUgc2V0UGVybWlzc2lvbihoYXNQZXJtaXNzaW9uOiBib29sZWFuIHwgbnVsbCk6IHZvaWQge1xuICAgIHRoaXMuaGFzUGVybWlzc2lvbiA9IGhhc1Blcm1pc3Npb247XG4gICAgdGhpcy5wZXJtaXNzaW9uUmVzcG9uc2UubmV4dChoYXNQZXJtaXNzaW9uKTtcbiAgfVxuXG59XG4iLCI8dmlkZW8gI3ByZXZpZXcgW3N0eWxlLm9iamVjdC1maXRdPVwicHJldmlld0ZpdE1vZGVcIj5cbiAgPHA+XG4gICAgWW91ciBicm93c2VyIGRvZXMgbm90IHN1cHBvcnQgdGhpcyBmZWF0dXJlLCBwbGVhc2UgdHJ5IHRvIHVwZ3JhZGUgaXQuXG4gIDwvcD5cbiAgPHA+XG4gICAgU2V1IG5hdmVnYWRvciBuw6NvIHN1cG9ydGEgZXN0ZSByZWN1cnNvLCBwb3IgZmF2b3IgdGVudGUgYXR1YWxpesOhLWxvLlxuICA8L3A+XG48L3ZpZGVvPlxuIl19