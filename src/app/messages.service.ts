import { Injectable } from '@angular/core';
import { ContextService } from './context.service';
import { GLOBAL_STATE } from './global-state';

const CNAME = 'MessagesService';

export enum MessageType {
  Config = 'config',
  Initialized = 'initialized',
  Enter = 'enter',
  Leave = 'leave',
  RoomUrl = 'room-url',
  Snapshot = 'snapshot',
  UserData = 'user-data'
}

@Injectable({
  providedIn: 'root'
})
export class MessagesService {

  constructor(private contextService: ContextService) {

    const listener = (event: any) => {

      if (event.data instanceof Array || (event.data instanceof Object && (event.data.type === 'webPackWarnings' ||
        event.data.source === 'react-devtools-content-script'))) {
        return
      }

      if (globalThis.ephemeralVideoLogLevel.isDebugEnabled) {
        console.debug(`${CNAME}|received event`, event);
      }

      const message = event.data;
      switch (message.type) {
        case MessageType.Config: {
          break;
        }
        case MessageType.Enter: {
          break;
        }
        case MessageType.Leave: {
          break;
        }
        case MessageType.UserData: {
          // this.contextService.setNickname(message.name)
          GLOBAL_STATE.nickname = message.name;
          break;
        }
        default:
          if (globalThis.ephemeralVideoLogLevel.isWarnEnabled) {
            console.warn(`${CNAME}|unknown type ${message.type}.`);
          }
      }

    };
    window.addEventListener('message', listener, false);

    // Notify the application is ready to receive messages
    this.postMessage({
      type: MessageType.Initialized
    })

  }

  postMessage = (message: any) => {
    if (globalThis.ephemeralVideoLogLevel.isDebugEnabled) {
      console.debug(`${CNAME}|postMessage`, message);
    }
    window.parent.postMessage(message, '*')
  };
}
