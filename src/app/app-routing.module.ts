import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';
import { TeslComponent } from './tesl/tesl.component';

const routes: Routes = [
  { path: 'tesl', component: TeslComponent },
  //{ path: 'board', component: BoardComponent },
  //{ path: 'maze-runner', loadChildren: () => import('./maze-runner/maze-runner.module').then(m => m.MazeRunnerModule) },
  { path: '', redirectTo: '/', pathMatch: 'full' }, // Default route
  { path: '**', redirectTo: '/' } // Wildcard route for unmatched URLs
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }
