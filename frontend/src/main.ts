import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';
import { AppModule } from './app/app.module';
import { environment } from './environments/environment';

if (environment.production) {
  // Disable console logs in production
  console.log = () => {};
  console.warn = () => {};
  console.info = () => {};
}

platformBrowserDynamic().bootstrapModule(AppModule)
  .catch(err => console.error(err));