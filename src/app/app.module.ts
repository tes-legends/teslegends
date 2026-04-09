import { NgModule, provideAppInitializer, inject } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { Router } from '@angular/router';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { ServiceWorkerModule } from '@angular/service-worker';
import { environment } from '../environments/environment';
import { FormsModule } from '@angular/forms';
import { MatGridListModule } from '@angular/material/grid-list';
import { MatDialogModule } from '@angular/material/dialog';
import { DragDropModule } from '@angular/cdk/drag-drop';

import { TeslComponent } from './tesl/tesl.component';
import { TeslCardComponent } from './tesl-card/tesl-card.component';
import { CollectionViewerComponent } from './collection/collection.component';
import { DeckBuilderComponent } from './deck-builder/deck-builder.component';
import { ArenaDraftComponent } from './arena-draft/arena-draft.component';
import { RankedComponent } from './ranked/ranked.component';

export function restoreRedirect(router: Router) {
  return () => {
    const redirect = sessionStorage.getItem('redirect');
    if (redirect) {
      sessionStorage.removeItem('redirect');
      history.replaceState(null, '', redirect);
    }
  };
}

@NgModule({
  declarations: [
    AppComponent,
    TeslComponent,
    TeslCardComponent,
    CollectionViewerComponent,
    DeckBuilderComponent,
    ArenaDraftComponent,
    RankedComponent
  ],
  imports: [
    BrowserModule,                          // ← MUST BE HERE (root module only)
    BrowserAnimationsModule,
    AppRoutingModule,
    MatGridListModule,
    MatDialogModule,
    DragDropModule,
    FormsModule,
    ServiceWorkerModule.register('ngsw-worker.js', { 
      enabled: environment.production 
    }),
    // CommonModule is not needed when BrowserModule is present (it re-exports it)
    // FormsModule,   // uncomment if you use ngModel, forms, etc.
  ],
  providers: [
    provideAppInitializer(() => {
      const initializerFn = restoreRedirect(inject(Router));  // Note: inject() should work here in Angular 21
      return initializerFn();
    }),
    provideHttpClient(withInterceptorsFromDi())
  ],
  bootstrap: [AppComponent]
})
export class AppModule { }