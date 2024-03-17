import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

import { ByeComponent } from './bye/bye.component';
import { HomeComponent } from './home/home.component';
import { LoginComponent } from './login/login.component';

import { APP_BASE_HREF } from '@angular/common';

const routes: Routes = [
  { path: '', component: HomeComponent }, //, canActivate: [AuthGuard]
  { path: ':id', component: HomeComponent },
  { path: 'bye', component: ByeComponent },
  { path: 'login', component: LoginComponent },
  // { path: '', redirectTo: '/home', pathMatch: 'full' },
  // { path: ':id', redirectTo: '/home/:id', pathMatch: 'full' }
];

// https://angular.io/guide/router#base-href
// https://angular.io/api/common/APP_BASE_HREF
@NgModule({
  providers: [{ provide: APP_BASE_HREF, useValue: '/ephemeral-video' }],
  imports: [RouterModule.forRoot(routes, { useHash: false })], //useHash: true
  exports: [RouterModule]
})
export class AppRoutingModule { }
