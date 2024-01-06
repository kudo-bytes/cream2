import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { checkAuthState } from './core/guards/auth.guards';

const routes: Routes = [
  {
    path: 'login',
    loadChildren: () => import('./modules/login/login.module').then(m => m.LoginModule),
    canActivate: [checkAuthState],
  },
  {
    path: 'register',
    loadChildren: () => import('./modules/register/register.module').then(m => m.RegisterModule),
    canActivate: [checkAuthState],
  },
  {
    path: '',
    loadChildren: () => import('./modules/main/main.module').then(m => m.MainModule),
    canActivate: [checkAuthState],
  }
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }
