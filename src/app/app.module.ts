import { BrowserModule } from '@angular/platform-browser';
import { APP_INITIALIZER,NgModule } from '@angular/core';
import { Router } from '@angular/router'; // optional but recommended
import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { ServiceWorkerModule } from '@angular/service-worker';
import { environment } from '../environments/environment';
import { MatGridListModule } from '@angular/material/grid-list';
import { FormsModule } from '@angular/forms';
import { DragDropModule } from '@angular/cdk/drag-drop';
import { HttpClientModule } from '@angular/common/http';
import { MatDialogModule } from '@angular/material/dialog';
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
      // Option A: Use plain history (fast, no router events)
      history.replaceState(null, '', redirect);

      // Option B: Use Angular Router (triggers navigation events, guards, etc.)
      // router.navigateByUrl(redirect);
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
    BrowserModule,
    MatGridListModule,
    AppRoutingModule,
    BrowserAnimationsModule,
    MatDialogModule,
    FormsModule,
    DragDropModule,
    HttpClientModule,
    ServiceWorkerModule.register('ngsw-worker.js', { enabled: environment.production })
  ],
  providers: [
    {
      provide: APP_INITIALIZER,
      useFactory: restoreRedirect,
      deps: [Router],           // ← remove Router dep if using plain history
      multi: true
    }
  ],
  bootstrap: [AppComponent]
})
export class AppModule { }
