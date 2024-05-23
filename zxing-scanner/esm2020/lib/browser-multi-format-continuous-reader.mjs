import { ChecksumException, FormatException, NotFoundException } from '@zxing/library';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { BehaviorSubject } from 'rxjs';
/**
 * Based on zxing-typescript BrowserCodeReader
 */
export class BrowserMultiFormatContinuousReader extends BrowserMultiFormatReader {
    /**
     * Returns the code reader scanner controls.
     */
    getScannerControls() {
        if (!this.scannerControls) {
            throw new Error('No scanning is running at the time.');
        }
        return this.scannerControls;
    }
    /**
     * Starts the decoding from the current or a new video element.
     *
     * @param deviceId The device's to be used Id
     * @param previewEl A new video element
     */
    async scanFromDeviceObservable(deviceId, previewEl) {
        const scan$ = new BehaviorSubject({});
        let ctrls;
        try {
            ctrls = await this.decodeFromVideoDevice(deviceId, previewEl, (result, error) => {
                if (!error) {
                    scan$.next({ result });
                    return;
                }
                const errorName = error.name;
                // stream cannot stop on fails.
                if (
                // scan Failure - found nothing, no error
                errorName === NotFoundException.name ||
                    // scan Error - found the QR but got error on decoding
                    errorName === ChecksumException.name ||
                    errorName === FormatException.name ||
                    error.message.includes('No MultiFormat Readers were able to detect the code.')) {
                    scan$.next({ error });
                    return;
                }
                // probably fatal error
                scan$.error(error);
                this.scannerControls.stop();
                this.scannerControls = undefined;
                return;
            });
            this.scannerControls = {
                ...ctrls,
                stop() {
                    ctrls.stop();
                    scan$.complete();
                },
            };
        }
        catch (e) {
            scan$.error(e);
            this.scannerControls?.stop();
            this.scannerControls = undefined;
        }
        return scan$.asObservable();
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYnJvd3Nlci1tdWx0aS1mb3JtYXQtY29udGludW91cy1yZWFkZXIuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi9wcm9qZWN0cy96eGluZy1zY2FubmVyL3NyYy9saWIvYnJvd3Nlci1tdWx0aS1mb3JtYXQtY29udGludW91cy1yZWFkZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsT0FBTyxFQUFFLGlCQUFpQixFQUFFLGVBQWUsRUFBRSxpQkFBaUIsRUFBRSxNQUFNLGdCQUFnQixDQUFDO0FBQ3ZGLE9BQU8sRUFBRSx3QkFBd0IsRUFBb0IsTUFBTSxnQkFBZ0IsQ0FBQztBQUM1RSxPQUFPLEVBQUUsZUFBZSxFQUFjLE1BQU0sTUFBTSxDQUFDO0FBR25EOztHQUVHO0FBQ0gsTUFBTSxPQUFPLGtDQUFtQyxTQUFRLHdCQUF3QjtJQVE5RTs7T0FFRztJQUNJLGtCQUFrQjtRQUN2QixJQUFJLENBQUMsSUFBSSxDQUFDLGVBQWUsRUFBRTtZQUN6QixNQUFNLElBQUksS0FBSyxDQUFDLHFDQUFxQyxDQUFDLENBQUM7U0FDeEQ7UUFDRCxPQUFPLElBQUksQ0FBQyxlQUFlLENBQUM7SUFDOUIsQ0FBQztJQUVEOzs7OztPQUtHO0lBQ0ksS0FBSyxDQUFDLHdCQUF3QixDQUNuQyxRQUFpQixFQUNqQixTQUE0QjtRQUc1QixNQUFNLEtBQUssR0FBRyxJQUFJLGVBQWUsQ0FBaUIsRUFBRSxDQUFDLENBQUM7UUFDdEQsSUFBSSxLQUFLLENBQUM7UUFFVixJQUFJO1lBQ0YsS0FBSyxHQUFHLE1BQU0sSUFBSSxDQUFDLHFCQUFxQixDQUFDLFFBQVEsRUFBRSxTQUFTLEVBQUUsQ0FBQyxNQUFNLEVBQUUsS0FBSyxFQUFFLEVBQUU7Z0JBRTlFLElBQUksQ0FBQyxLQUFLLEVBQUU7b0JBQ1YsS0FBSyxDQUFDLElBQUksQ0FBQyxFQUFFLE1BQU0sRUFBRSxDQUFDLENBQUM7b0JBQ3ZCLE9BQU87aUJBQ1I7Z0JBRUQsTUFBTSxTQUFTLEdBQUcsS0FBSyxDQUFDLElBQUksQ0FBQztnQkFFN0IsK0JBQStCO2dCQUMvQjtnQkFDRSx5Q0FBeUM7Z0JBQ3pDLFNBQVMsS0FBSyxpQkFBaUIsQ0FBQyxJQUFJO29CQUNwQyxzREFBc0Q7b0JBQ3RELFNBQVMsS0FBSyxpQkFBaUIsQ0FBQyxJQUFJO29CQUNwQyxTQUFTLEtBQUssZUFBZSxDQUFDLElBQUk7b0JBQ2xDLEtBQUssQ0FBQyxPQUFPLENBQUMsUUFBUSxDQUFDLHNEQUFzRCxDQUFDLEVBQzlFO29CQUNBLEtBQUssQ0FBQyxJQUFJLENBQUMsRUFBRSxLQUFLLEVBQUUsQ0FBQyxDQUFDO29CQUN0QixPQUFPO2lCQUNSO2dCQUVELHVCQUF1QjtnQkFDdkIsS0FBSyxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsQ0FBQztnQkFDbkIsSUFBSSxDQUFDLGVBQWUsQ0FBQyxJQUFJLEVBQUUsQ0FBQztnQkFDNUIsSUFBSSxDQUFDLGVBQWUsR0FBRyxTQUFTLENBQUM7Z0JBQ2pDLE9BQU87WUFDVCxDQUFDLENBQUMsQ0FBQztZQUVILElBQUksQ0FBQyxlQUFlLEdBQUc7Z0JBQ3JCLEdBQUcsS0FBSztnQkFDUixJQUFJO29CQUNGLEtBQUssQ0FBQyxJQUFJLEVBQUUsQ0FBQztvQkFDYixLQUFLLENBQUMsUUFBUSxFQUFFLENBQUM7Z0JBQ25CLENBQUM7YUFDRixDQUFDO1NBQ0g7UUFBQyxPQUFPLENBQUMsRUFBRTtZQUNWLEtBQUssQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDZixJQUFJLENBQUMsZUFBZSxFQUFFLElBQUksRUFBRSxDQUFDO1lBQzdCLElBQUksQ0FBQyxlQUFlLEdBQUcsU0FBUyxDQUFDO1NBQ2xDO1FBRUQsT0FBTyxLQUFLLENBQUMsWUFBWSxFQUFFLENBQUM7SUFDOUIsQ0FBQztDQUNGIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgQ2hlY2tzdW1FeGNlcHRpb24sIEZvcm1hdEV4Y2VwdGlvbiwgTm90Rm91bmRFeGNlcHRpb24gfSBmcm9tICdAenhpbmcvbGlicmFyeSc7XG5pbXBvcnQgeyBCcm93c2VyTXVsdGlGb3JtYXRSZWFkZXIsIElTY2FubmVyQ29udHJvbHMgfSBmcm9tICdAenhpbmcvYnJvd3Nlcic7XG5pbXBvcnQgeyBCZWhhdmlvclN1YmplY3QsIE9ic2VydmFibGUgfSBmcm9tICdyeGpzJztcbmltcG9ydCB7IFJlc3VsdEFuZEVycm9yIH0gZnJvbSAnLi9SZXN1bHRBbmRFcnJvcic7XG5cbi8qKlxuICogQmFzZWQgb24genhpbmctdHlwZXNjcmlwdCBCcm93c2VyQ29kZVJlYWRlclxuICovXG5leHBvcnQgY2xhc3MgQnJvd3Nlck11bHRpRm9ybWF0Q29udGludW91c1JlYWRlciBleHRlbmRzIEJyb3dzZXJNdWx0aUZvcm1hdFJlYWRlciB7XG5cbiAgLyoqXG4gICAqIEFsbG93cyB0byBjYWxsIHNjYW5uZXIgY29udHJvbHMgQVBJIHdoaWxlIHNjYW5uaW5nLlxuICAgKiBXaWxsIGJlIHVuZGVmaW5lZCBpZiBubyBzY2FubmluZyBpcyBydW5uaW5nLlxuICAgKi9cbiAgcHJvdGVjdGVkIHNjYW5uZXJDb250cm9sczogSVNjYW5uZXJDb250cm9scztcblxuICAvKipcbiAgICogUmV0dXJucyB0aGUgY29kZSByZWFkZXIgc2Nhbm5lciBjb250cm9scy5cbiAgICovXG4gIHB1YmxpYyBnZXRTY2FubmVyQ29udHJvbHMoKTogSVNjYW5uZXJDb250cm9scyB7XG4gICAgaWYgKCF0aGlzLnNjYW5uZXJDb250cm9scykge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdObyBzY2FubmluZyBpcyBydW5uaW5nIGF0IHRoZSB0aW1lLicpO1xuICAgIH1cbiAgICByZXR1cm4gdGhpcy5zY2FubmVyQ29udHJvbHM7XG4gIH1cblxuICAvKipcbiAgICogU3RhcnRzIHRoZSBkZWNvZGluZyBmcm9tIHRoZSBjdXJyZW50IG9yIGEgbmV3IHZpZGVvIGVsZW1lbnQuXG4gICAqXG4gICAqIEBwYXJhbSBkZXZpY2VJZCBUaGUgZGV2aWNlJ3MgdG8gYmUgdXNlZCBJZFxuICAgKiBAcGFyYW0gcHJldmlld0VsIEEgbmV3IHZpZGVvIGVsZW1lbnRcbiAgICovXG4gIHB1YmxpYyBhc3luYyBzY2FuRnJvbURldmljZU9ic2VydmFibGUoXG4gICAgZGV2aWNlSWQ/OiBzdHJpbmcsXG4gICAgcHJldmlld0VsPzogSFRNTFZpZGVvRWxlbWVudFxuICApOiBQcm9taXNlPE9ic2VydmFibGU8UmVzdWx0QW5kRXJyb3I+PiB7XG5cbiAgICBjb25zdCBzY2FuJCA9IG5ldyBCZWhhdmlvclN1YmplY3Q8UmVzdWx0QW5kRXJyb3I+KHt9KTtcbiAgICBsZXQgY3RybHM7XG5cbiAgICB0cnkge1xuICAgICAgY3RybHMgPSBhd2FpdCB0aGlzLmRlY29kZUZyb21WaWRlb0RldmljZShkZXZpY2VJZCwgcHJldmlld0VsLCAocmVzdWx0LCBlcnJvcikgPT4ge1xuXG4gICAgICAgIGlmICghZXJyb3IpIHtcbiAgICAgICAgICBzY2FuJC5uZXh0KHsgcmVzdWx0IH0pO1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IGVycm9yTmFtZSA9IGVycm9yLm5hbWU7XG5cbiAgICAgICAgLy8gc3RyZWFtIGNhbm5vdCBzdG9wIG9uIGZhaWxzLlxuICAgICAgICBpZiAoXG4gICAgICAgICAgLy8gc2NhbiBGYWlsdXJlIC0gZm91bmQgbm90aGluZywgbm8gZXJyb3JcbiAgICAgICAgICBlcnJvck5hbWUgPT09IE5vdEZvdW5kRXhjZXB0aW9uLm5hbWUgfHxcbiAgICAgICAgICAvLyBzY2FuIEVycm9yIC0gZm91bmQgdGhlIFFSIGJ1dCBnb3QgZXJyb3Igb24gZGVjb2RpbmdcbiAgICAgICAgICBlcnJvck5hbWUgPT09IENoZWNrc3VtRXhjZXB0aW9uLm5hbWUgfHxcbiAgICAgICAgICBlcnJvck5hbWUgPT09IEZvcm1hdEV4Y2VwdGlvbi5uYW1lIHx8XG4gICAgICAgICAgZXJyb3IubWVzc2FnZS5pbmNsdWRlcygnTm8gTXVsdGlGb3JtYXQgUmVhZGVycyB3ZXJlIGFibGUgdG8gZGV0ZWN0IHRoZSBjb2RlLicpXG4gICAgICAgICkge1xuICAgICAgICAgIHNjYW4kLm5leHQoeyBlcnJvciB9KTtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICAvLyBwcm9iYWJseSBmYXRhbCBlcnJvclxuICAgICAgICBzY2FuJC5lcnJvcihlcnJvcik7XG4gICAgICAgIHRoaXMuc2Nhbm5lckNvbnRyb2xzLnN0b3AoKTtcbiAgICAgICAgdGhpcy5zY2FubmVyQ29udHJvbHMgPSB1bmRlZmluZWQ7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH0pO1xuXG4gICAgICB0aGlzLnNjYW5uZXJDb250cm9scyA9IHtcbiAgICAgICAgLi4uY3RybHMsXG4gICAgICAgIHN0b3AoKSB7XG4gICAgICAgICAgY3RybHMuc3RvcCgpO1xuICAgICAgICAgIHNjYW4kLmNvbXBsZXRlKCk7XG4gICAgICAgIH0sXG4gICAgICB9O1xuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIHNjYW4kLmVycm9yKGUpO1xuICAgICAgdGhpcy5zY2FubmVyQ29udHJvbHM/LnN0b3AoKTtcbiAgICAgIHRoaXMuc2Nhbm5lckNvbnRyb2xzID0gdW5kZWZpbmVkO1xuICAgIH1cblxuICAgIHJldHVybiBzY2FuJC5hc09ic2VydmFibGUoKTtcbiAgfVxufVxuIl19