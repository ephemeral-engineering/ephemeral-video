import { Injectable } from '@angular/core';
import { Observable, Subject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class ContextService {

  nickname: string = "";
  private nicknameSubject = new Subject<string>();
  nickname$: Observable<string> = this.nicknameSubject.asObservable();

  private peerStatusSubject = new Subject<string>();
  peerStatus$: Observable<string> = this.peerStatusSubject.asObservable();

  private sinkIdSubject = new Subject<string>();
  sinkId$: Observable<string> = this.sinkIdSubject.asObservable();

  constructor() { }

  setNickname(value: string) {
    this.nickname = value;
    this.nicknameSubject.next(value)
  }

  recordPeerStatus(status: string) {
    this.peerStatusSubject.next(status)
  }

  setSinkId(sinkId: string) {
    this.sinkIdSubject.next(sinkId)
  }
}
