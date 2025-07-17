import { NgModule, provideBrowserGlobalErrorListeners } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';

import { AppRoutingModule } from './app-routing-module';
import { App } from './app';
import { AppleAuth } from './Auth/apple-auth/apple-auth';
import { Success } from './success/success';
import { Error } from './error/error';

@NgModule({
  declarations: [
    App,
    AppleAuth,
    Success,
    Error
  ],
  imports: [
    BrowserModule,
    AppRoutingModule
  ],
  providers: [
    provideBrowserGlobalErrorListeners()
  ],
  bootstrap: [App]
})
export class AppModule { }
