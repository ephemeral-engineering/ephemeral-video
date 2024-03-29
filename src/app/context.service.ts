import { Injectable } from '@angular/core';
import { Observable, Subject } from 'rxjs';
import { getSessionStorage } from './common';
import { STORAGE_PREFIX } from './constants';

@Injectable({
  providedIn: 'root'
})
export class ContextService {

  nickname: string = getSessionStorage(`${STORAGE_PREFIX}-nickname`) || '';
  private nicknameSubject = new Subject<string>();
  nickname$: Observable<string> = this.nicknameSubject.asObservable();

  private notificationSubject = new Subject<string>();
  notifications$: Observable<string> = this.notificationSubject.asObservable();

  private sinkIdSubject = new Subject<string>();
  sinkId$: Observable<string> = this.sinkIdSubject.asObservable();

  constructor() { }

  setNickname(value: string) {
    this.nickname = value;
    this.nicknameSubject.next(value)
  }

  recordNotification(msg: string) {
    this.notificationSubject.next(msg)
  }

  setSinkId(sinkId: string) {
    this.sinkIdSubject.next(sinkId)
  }
}
