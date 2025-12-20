import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

import { HomeComponent } from './home/home.component';

// import { APP_BASE_HREF } from '@angular/common';

const routes: Routes = [
  { path: '', component: HomeComponent }, //, canActivate: [AuthGuard]
  { path: ':id', component: HomeComponent },
];

// https://angular.io/guide/router#base-href
// https://angular.io/api/common/APP_BASE_HREF
@NgModule({
  providers: [], //{ provide: APP_BASE_HREF, useValue: '/ephemeral-video' }
  imports: [RouterModule.forRoot(routes, { useHash: false })], //useHash: true
  exports: [RouterModule]
})
export class AppRoutingModule { }
