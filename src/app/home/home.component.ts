import { ClipboardModule } from '@angular/cdk/clipboard';
import { JsonPipe, KeyValuePipe, NgFor, NgIf, NgStyle } from '@angular/common';
import { AfterViewInit, Component, ElementRef, HostListener, Inject, OnDestroy, ViewChild } from '@angular/core';
import { FormsModule, UntypedFormBuilder, UntypedFormControl, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { ActivatedRoute } from "@angular/router";

import { Conversation, ConversationOptions, LocalParticipant, LocalStream, RemoteParticipant, RemoteStream, User, setLogLevel as setEphWebRtcLogLevel } from 'ephemeral-webrtc';

import { saveAs } from 'file-saver-es';

import { LogLevelText, setLogLevel } from 'src/logLevel';
import { ContextService } from '../context.service';
import { LocalStreamComponent } from '../local-stream/local-stream.component';
import { MessageType, MessagesService } from '../messages.service';
import { RemoteStreamComponent } from '../remote-stream/remote-stream.component';
import { WINDOW } from '../windows-provider';
import { getSessionStorage, setSessionStorage } from '../common';
import { STORAGE_PREFIX } from '../constants';
import { FilterOutPipe } from '../filter-out.pipe';

interface UserData {
  nickname: string
  isModerator: boolean
}

interface Message {
  text: string
}

const CNAME = 'Home';

@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.css'],
  standalone: true,
  imports: [NgIf, NgFor, NgStyle, JsonPipe,
    ClipboardModule,
    LocalStreamComponent, RemoteStreamComponent,
    MatButtonModule, MatIconModule,
    FormsModule, MatFormFieldModule, MatInputModule,
    MatSelectModule,
    KeyValuePipe, FilterOutPipe]
})
export class HomeComponent implements AfterViewInit, OnDestroy {

  conversation: Conversation | undefined;

  // Messages (defined as an array of tuples)
  public readonly messages: Array<[UserData, Message]> = new Array();

  readonly remoteCandidates: Set<User> = new Set();
  readonly remoteParticipants: Set<RemoteParticipant> = new Set();

  messageFormGroup = this.fb.group({
    message: this.fb.control('', [Validators.required])
  });
  get messageFc(): UntypedFormControl {
    return this.messageFormGroup.get('message') as UntypedFormControl;
  }

  get nickname() {
    //return this.localParticipant?.user.getUserData().nickname || getSessionStorage(`${STORAGE_PREFIX}-nickname`);
    return this.contextService.nickname
  }
  set nickname(value: string) {
    this.localParticipant?.user.setUserData({ ...this.localParticipant?.user.getUserData(), nickname: value })
    this.contextService.setNickname(value)
    setSessionStorage(`${STORAGE_PREFIX}-nickname`, value)
  }

  // readonly year: number = new Date().getFullYear();

  localParticipant: LocalParticipant | undefined;

  localMediaStream: MediaStream | undefined;
  localStream: LocalStream | undefined;

  audioTrackCapabilities: MediaTrackCapabilities | undefined;
  audioTrackConstraints: MediaTrackConstraints | undefined;
  audioTrackSettings: MediaTrackSettings | undefined;
  videoTrackCapabilities: MediaTrackCapabilities | undefined;
  videoTrackConstraints: MediaTrackConstraints | undefined;
  videoTrackSettings: MediaTrackSettings | undefined;

  localDisplayMediaStream: MediaStream | undefined;

  moderated: boolean = false;
  moderator: boolean = false;

  url: string | undefined;

  remoteStreamsByParticipant: Map<RemoteParticipant, Set<RemoteStream>> = new Map();

  get _width() {
    return `${Math.floor(100 / this.remoteStreamsByParticipant.size)}%`;
  }

  isWaitingForAcceptance = false;

  // snapshotSrc?: string;

  @ViewChild("dwnld") aRef: ElementRef | undefined;

  // Note : beforeUnloadHandler alone does not work on android Chrome
  // seems it requires unloadHandler to do the same to work everywhere...
  // https://stackoverflow.com/questions/35779372/window-onbeforeunload-doesnt-trigger-on-android-chrome-alt-solution
  //
  // COMMENTED OUT BECAUSE ephemeral server does the cleanup anyays !
  //
  @HostListener('window:unload', ['$event'])
  unloadHandler(event: any) {
    // console.log("unloadHandler", event);
    event.preventDefault()
    this.doCleanUp()
  }
  // Use BEFORE unload to hangup (works for Firefox at least)
  // This is useful if user closes the tab, or refreshes the page
  @HostListener('window:beforeunload', ['$event'])
  beforeUnloadHandler(event: BeforeUnloadEvent) {
    event.preventDefault()
    this.doCleanUp()
    event.returnValue = true;
  }

  _notifications: string[] = new Array();

  bandwidthByPeerId: Map<string, number> = new Map();
  averageBandwidth: number = 0;

  constructor(@Inject(WINDOW) public window: Window,
    private activatedRoute: ActivatedRoute,
    private contextService: ContextService,
    private messagesService: MessagesService,
    private fb: UntypedFormBuilder,
  ) { }

  ngOnInit(): void {
    const logLevel = this.activatedRoute.snapshot.queryParamMap.get('lL') as LogLevelText;
    if (logLevel) {
      setLogLevel(logLevel)
      setEphWebRtcLogLevel(logLevel)
    }

    const hash = this.activatedRoute.snapshot.queryParamMap.get('hash') as string;

    // Register
    this.contextService.nickname$.subscribe(value => {
      if (globalThis.ephemeralVideoLogLevel.isDebugEnabled) {
        console.debug(`${CNAME}|ngOnInit nickname$.subscribe`, value, this.contextService.nickname)
      }
      this.localParticipant?.user.setUserData({ ...this.localParticipant.user.getUserData(), nickname: value })
    });

    this.contextService.notifications$.subscribe(status => {
      this._notifications.push(`${new Date().toLocaleTimeString()}: ${status}`)
    });

    // this.moderator = !this.authService.user?.isAnonymous;

    // Get conversation name and base url from current path (pattern : "/path/to/<conversationid>")
    //
    const conversationId = this.activatedRoute.snapshot.paramMap.get("id") || undefined;

    var baseUrl: string;
    if (conversationId) {
      const path = this.window.location.pathname.split('/');
      // remove last element which is the conversationName
      path.pop();
      // and recreate base url
      baseUrl = `${this.window.location.origin}${path.join('/')}`;
    } else {
      // remove trailing slash
      baseUrl = this.window.location.href.replace(/\/$/, "");
    }

    if (globalThis.ephemeralVideoLogLevel.isDebugEnabled) {
      console.debug(`${CNAME}|ngOnInit`, baseUrl, conversationId, hash)
    }

    const options: ConversationOptions = {
      moderated: this.moderated
    };

    Conversation.getOrCreate(conversationId, /^true$/i.test(hash), options).then((conversation: Conversation) => {
      if (globalThis.ephemeralVideoLogLevel.isInfoEnabled) {
        console.log(`${CNAME}|Conversation`, conversation)
      }

      this.conversation = conversation;

      window.history.replaceState({}, '', `${baseUrl}/${conversation.id}`)

      // Listen to Conversation events
      //

      conversation.onConnectionStatus = (status: string) => {
        this._notifications.push(`${new Date().toLocaleTimeString()}: Server ${status}`);
      }

      conversation.onBandwidth = (peerId: string, speedKbps: number, average: number) => {
        this.bandwidthByPeerId.set(peerId, speedKbps)
        this.averageBandwidth = average;
      };

      conversation.onModeratedChanged = (moderated: boolean) => {
        this.moderated = moderated;
      };
      conversation.onCandidateAdded = (candidate: User) => {
        if (globalThis.ephemeralVideoLogLevel.isDebugEnabled) {
          console.debug(`${CNAME}|onCandidateAdded`, candidate)
        }
        // Maintain local list of pending Candidates
        this.remoteCandidates.add(candidate)
      };
      conversation.onCandidateRemoved = (candidate: User) => {
        if (globalThis.ephemeralVideoLogLevel.isDebugEnabled) {
          console.debug(`${CNAME}|onCandidateRemoved`, candidate)
        }
        // Maintain local list of pending Candidates
        this.remoteCandidates.delete(candidate)
      };
      conversation.onParticipantAdded = (participant: RemoteParticipant) => {
        if (globalThis.ephemeralVideoLogLevel.isDebugEnabled) {
          console.debug(`${CNAME}|onParticipantAdded`, participant)
        }

        this.remoteParticipants.add(participant);

        participant.user.onUserDataUpdate((userData: UserData) => {
          if (globalThis.ephemeralVideoLogLevel.isInfoEnabled) {
            console.log(`${CNAME}|onUserDataUpdate`, participant, userData)
          }
        })
        participant.onStreamPublished((stream: RemoteStream) => {
          if (globalThis.ephemeralVideoLogLevel.isInfoEnabled) {
            console.log(`${CNAME}|onStreamPublished`, participant, stream)
          }
          // First, set listener(s)
          this.doStoreRemoteStreamByParticipant(participant, stream)
          // And then, subscribe
          // this.localParticipant?.subscribe(stream)
          stream.subscribe()
          // or 
          //stream.subscribe({ audio: true, video: false })
        })
        participant.onStreamUnpublished((stream: RemoteStream) => {
          if (globalThis.ephemeralVideoLogLevel.isInfoEnabled) {
            console.log(`${CNAME}|onStreamUnpublished`, participant, stream)
          }
          this.doRemoveMediaStream(participant, stream)
        })
      };
      conversation.onParticipantRemoved = (participant: RemoteParticipant | LocalParticipant) => {
        if (globalThis.ephemeralVideoLogLevel.isInfoEnabled) {
          console.log(`${CNAME}|onParticipantRemoved`, participant)
        }
        if (participant instanceof RemoteParticipant) {
          this.doRemoveRemoteParticipant(participant)
        }
        else if (participant instanceof LocalParticipant) {
          if (globalThis.ephemeralVideoLogLevel.isInfoEnabled) {
            console.log(`${CNAME}|local user removed ?!`, participant)
          }
        }
      };

      // conversation.onMessage((participant: User, message: Message) => {
      //   this.messages.push([participant.userData as UserData, message])
      // })

      // Enter the conversation
      const userData: UserData = {
        nickname: this.contextService.nickname, //this.conversation.peerId, //this.authService.user?.displayName ||
        isModerator: this.moderator
      };
      if (globalThis.ephemeralVideoLogLevel.isDebugEnabled) {
        console.debug(`${CNAME}|joining with `, userData)
      }
      this.isWaitingForAcceptance = true;
      conversation.getOrCreateParticipant(userData, { moderator: this.moderator }).then((participant: LocalParticipant) => {
        if (globalThis.ephemeralVideoLogLevel.isInfoEnabled) {
          console.log(`${CNAME}|addParticipant succeed`, participant)
        }
        this.isWaitingForAcceptance = false;
        this.localParticipant = participant;

        this.publish()

        this.localParticipant.user.onUserDataUpdate((userData: UserData) => {
          if (globalThis.ephemeralVideoLogLevel.isInfoEnabled) {
            console.log(`${CNAME}|onUserDataUpdate`, this.localParticipant, userData)
          }
        })

        if (this.localParticipant.user.getUserData().nickname !== this.contextService.nickname) {
          if (globalThis.ephemeralVideoLogLevel.isInfoEnabled) {
            console.log(`${CNAME}|adjusting nickname`, participant)
          }
          this.localParticipant.user.setUserData({ ...this.localParticipant.user.getUserData(), nickname: this.contextService.nickname })
        }

      }).catch((error: any) => {
        if (globalThis.ephemeralVideoLogLevel.isWarnEnabled) {
          console.warn(`${CNAME}|addParticipant failed`, error)
        }
        this.isWaitingForAcceptance = false;
      })

      this.url = `${baseUrl}/${conversation.id}`;
      this.messagesService.postMessage({
        type: MessageType.RoomUrl,
        url: this.url
      })
    }).catch((error: any) => {
      console.error(`${CNAME}|getOrCreate failed`, error)
    })
  }

  grabbing: boolean = false;
  audioInMediaDevices: MediaDeviceInfo[];
  videoInMediaDevices: MediaDeviceInfo[];
  audioOutMediaDevices: MediaDeviceInfo[];

  updateDeviceList() {
    navigator.mediaDevices.enumerateDevices()
      .then((devices) => {
        this.audioInMediaDevices = devices.filter((d) => d.kind === 'audioinput')
        this.videoInMediaDevices = devices.filter((d) => d.kind === 'videoinput')
        this.audioOutMediaDevices = devices.filter((d) => d.kind === 'audiooutput')
      })
      .catch((err) => {
        console.error(`${err.name}: ${err.message}`);
      });
  }

  getUserMedia() {
    return new Promise<void>((resolve, reject) => {
      const supportedConstraints = navigator.mediaDevices.getSupportedConstraints();
      if (globalThis.ephemeralVideoLogLevel.isDebugEnabled) {
        console.debug(`${CNAME}|supportedConstraints`, supportedConstraints)
      }

      const audioConstraints = {
        echoCancellation: true,
        noiseSuppression: true,
        ...this._selectedAudioDeviceId ? { deviceId: this._selectedAudioDeviceId } : {},
      };

      const videoConstraints = {
        ...supportedConstraints['width'] ? { width: { min: 640, ideal: 1280, max: 4000 } } : {},
        ...supportedConstraints['height'] ? { height: { min: 480, ideal: 720, max: 3000 } } : {},
        // aspectRatio: 1.777777778,
        ...supportedConstraints['frameRate'] ? { frameRate: { ideal: 30, max: 60 } } : {},
        // facingMode: { exact: "user" },
        ...this._selectedVideoDeviceId ? { deviceId: this._selectedVideoDeviceId } : {},
      };

      if (globalThis.ephemeralVideoLogLevel.isDebugEnabled) {
        console.debug(`${CNAME}|navigator.mediaDevices`, navigator.mediaDevices)
      }
      navigator.mediaDevices.getUserMedia({ audio: audioConstraints, video: videoConstraints })
        .then((mediaStream: MediaStream) => {
          if (globalThis.ephemeralVideoLogLevel.isDebugEnabled) {
            console.debug(`${CNAME}|getUserMedia`, mediaStream)
          }

          this.doStoreAndBindLocalMediaStream(mediaStream)
          if (this.localStream) {
            this.localStream.replaceMediaStream(mediaStream)
          } else {
            this.publish()
          }
          resolve()
        }).catch((error) => {
          console.error(`${CNAME}|getUserMedia`, error)
          reject()
        }).finally(() => {
          this.updateDeviceList()
        })
    })

  }

  ngAfterViewInit() {
    navigator.mediaDevices.ondevicechange = (event) => {
      this.updateDeviceList()
    };
    this.getUserMedia()
  }

  _selectedAudioDeviceId = getSessionStorage(`${STORAGE_PREFIX}-audioDeviceId`);
  set selectedAudioDeviceId(id: string) {
    this.grabbing = true;
    this._selectedAudioDeviceId = id;
    this.getUserMedia().then(() => {
      setSessionStorage(`${STORAGE_PREFIX}-audioDeviceId`, id)
    }).finally(() => {
      this.grabbing = false;
    })
  }
  get selectedAudioDeviceId() {
    return this._selectedAudioDeviceId || "";
  }

  _selectedVideoDeviceId = getSessionStorage(`${STORAGE_PREFIX}-videoDeviceId`);
  set selectedVideoDeviceId(id: string) {
    if (globalThis.ephemeralVideoLogLevel.isDebugEnabled) {
      console.debug(`${CNAME}|set selectedVideoDeviceId`, id)
    }
    this.grabbing = true;
    this._selectedVideoDeviceId = id;
    this.getUserMedia().then(() => {
      setSessionStorage(`${STORAGE_PREFIX}-videoDeviceId`, id)
    }).finally(() => {
      this.grabbing = false;
    })
  }
  get selectedVideoDeviceId() {
    return this._selectedVideoDeviceId || "";
  }

  _selectedAudioOutputDeviceId = getSessionStorage(`${STORAGE_PREFIX}-audioOutDeviceId`);
  set selectedAudioOutputDeviceId(id: string) {
    this._selectedAudioOutputDeviceId = id;
    setSessionStorage(`${STORAGE_PREFIX}-audioOutDeviceId`, id)
    this.contextService.setSinkId(id)
  }
  get selectedAudioOutputDeviceId() {
    return this._selectedAudioOutputDeviceId || "";
  }

  onSnapshot(dataUrl: string) {
    if (globalThis.ephemeralVideoLogLevel.isDebugEnabled) {
      console.debug(`${CNAME}|took snapshot`, dataUrl);
    }
    // dataUrl = data:image/png;base64,...
    const type = dataUrl.split(';')[0].split('/')[1];
    const str = new Date().toJSON();
    // str = 2024-01-14T15:04:04.494Z
    saveAs(dataUrl, `snapshot_${str.slice(0, 10)}_${str.slice(11, 19).replace(/:/g, '-')}.${type}`)

    // TODO conditionally saveAs or post ! depending on config passed though inbound message ?

    this.messagesService.postMessage({
      type: MessageType.Snapshot,
      dataUrl
    })
  }

  doStoreAndBindLocalMediaStream(mediaStream: MediaStream) {
    this.localMediaStream = mediaStream;
    this.doGatherCapConstSettings()
    //this.doListenToTracksEvents(mediaStream, "LOCAL:");
  }

  echoCancellation = true;

  doGatherCapConstSettings() {
    if (this.localMediaStream) {
      for (const track of this.localMediaStream.getAudioTracks()) {
        if (typeof track.getCapabilities === 'function') {
          this.audioTrackCapabilities = track.getCapabilities();
        } else {
          if (globalThis.ephemeralVideoLogLevel.isWarnEnabled) {
            console.warn(`${CNAME}|getCapabilities not supported by browser`)
          }
        }
        if (typeof track.getConstraints === 'function') {
          this.audioTrackConstraints = track.getConstraints();
        } else {
          if (globalThis.ephemeralVideoLogLevel.isWarnEnabled) {
            console.warn(`${CNAME}|getConstraints not supported by browser`)
          }
        }
        if (typeof track.getSettings === 'function') {
          this.audioTrackSettings = track.getSettings();
        } else {
          if (globalThis.ephemeralVideoLogLevel.isWarnEnabled) {
            console.warn(`${CNAME}|getSettings not supported by browser`)
          }
        }
        break;
      }
      for (const track of this.localMediaStream.getVideoTracks()) {
        if (typeof track.getCapabilities === 'function') {
          this.videoTrackCapabilities = track.getCapabilities();
        } else {
          if (globalThis.ephemeralVideoLogLevel.isWarnEnabled) {
            console.warn(`${CNAME}|getCapabilities not supported by browser`)
          }
        }
        if (typeof track.getConstraints === 'function') {
          this.videoTrackConstraints = track.getConstraints();
        } else {
          if (globalThis.ephemeralVideoLogLevel.isWarnEnabled) {
            console.warn(`${CNAME}|getConstraints not supported by browser`)
          }
        }
        if (typeof track.getSettings === 'function') {
          this.videoTrackSettings = track.getSettings();
        } else {
          if (globalThis.ephemeralVideoLogLevel.isWarnEnabled) {
            console.warn(`${CNAME}|getSettings not supported by browser`)
          }
        }
        break;
      }
    }
  }

  // doListenToTracksEvents(mediaStream: MediaStream, logPrefix: string) {
  //   mediaStream.getTracks().forEach((track: MediaStreamTrack) => {
  //     track.onmute = (event) => {
  //       console.log(logPrefix + "onmute", mediaStream, track, event)
  //       if (this.localStream && (this.localStream.getMediaStream() === mediaStream)) {
  //         this.localStream.notifyTracksStatusChanged();
  //       }
  //     }
  //     track.onunmute = (event) => {
  //       console.log(logPrefix + "onunmute", mediaStream, track, event)
  //       if (this.localStream && (this.localStream.getMediaStream() === mediaStream)) {
  //         this.localStream.notifyTracksStatusChanged();
  //       }
  //     }
  //     track.onended = (event) => {
  //       console.log(logPrefix + "onended", mediaStream, track, event)
  //     }
  //   })
  // }

  blurredMediaStream: MediaStream | undefined;

  // blur() {
  //   if (this.localStream && this.localMediaStream) {
  //     this.blurredMediaStream = this.localMediaStream;
  //     this.localMediaStream = MediaStreamHelper.blur(this.localMediaStream);
  //     this.localStream.replaceMediaStream(this.localMediaStream)
  //   }
  // }

  ngOnDestroy(): void {
    this.doCleanUp()
  }

  // public signOut() {
  //   if (this.conversation) {
  //     this.conversation.close().then(() => {
  //       this.conversation = undefined;
  //       if (globalThis.ephemeralVideoLogLevel.isInfoEnabled) {
  //         console.info(`${CNAME}|Conversation closed`)
  //       }
  //     }).catch((error: any) => {
  //       console.error(`${CNAME}|Conversation closing error`, error)
  //     }).finally(() => {
  //       this.doSignOut()
  //     })
  //   } else {
  //     this.doSignOut()
  //   }
  // }

  // private doSignOut() {
  //   // TODO: migrate !
  //   // firebase.auth().signOut().then(() => {
  //   //   if (globalThis.logLevel.isInfoEnabled) {
  //   //     console.info(`${CNAME}|signed Out`);
  //   //   }
  //   //   this.router.navigate(['/login']);
  //   // }).catch(error => {
  //   //   console.error(`${CNAME}|doSignOut`, error)
  //   // });
  // }

  // --------------------------------------------------------------------------

  private doCleanUp() {
    if (this.conversation) {
      this.conversation.close()
      this.conversation = undefined;
    }
  }

  // toggleModeration() {
  //   this.conversation?.setModerated(!this.moderated);
  // }

  // accept(candidate: User) {
  //   this.conversation?.acceptCandidate(candidate);
  // }

  // reject(candidate: User) {
  //   this.conversation?.rejectCandidate(candidate);
  // }

  // eject(participant: RemoteParticipant) {
  //   this.conversation?.removeParticipant(participant);
  // }

  // sendMessage() {
  //   if (this.localParticipant) {
  //     this.localParticipant.sendMessage(this.messageFc.value);
  //   } else {
  //     console.error(`${CNAME}|Cannot sendMessage`, this.localParticipant)
  //   }
  // }

  // TODO : implement a sendPrivateMessage in the library ?

  publish() {
    if (this.localMediaStream && this.localParticipant) {
      this.localParticipant.publish(this.localMediaStream, { topic: 'webcam', audio: true }).then((localStream) => {
        this.localStream = localStream;
      });

      // const localStream = this.localStream;
      // localStream.onSubscribed((peerId: string) => {
      //   // localStream.setBandwidth(peerId, 256)
      // })

      // Or
      //this.localParticipant.publish(this.localMediaStream, { type: 'webcam', foo: 'bar' });
    } else {
      console.error(`${CNAME}|Cannot publish`, this.localMediaStream, this.localParticipant)
    }
  }

  unpublish() {
    if (this.localMediaStream) {
      this.localParticipant?.unpublish(this.localMediaStream)
      this.localStream = undefined;
    }
  }

  private doStoreRemoteStreamByParticipant(participant: RemoteParticipant, stream: RemoteStream) {
    if (!this.remoteStreamsByParticipant.has(participant)) {
      this.remoteStreamsByParticipant.set(participant, new Set());
    }
    this.remoteStreamsByParticipant.get(participant)?.add(stream);
  }

  private doRemoveMediaStream(participant: RemoteParticipant, stream: RemoteStream) {
    const deleted = this.remoteStreamsByParticipant.get(participant)?.delete(stream);
    if (globalThis.ephemeralVideoLogLevel.isDebugEnabled) {
      console.debug(`${CNAME}|doRemoveMediaStream`, participant, stream, deleted);
    }
  }

  private doRemoveRemoteParticipant(participant: RemoteParticipant) {
    this.remoteParticipants.delete(participant);
    const deleted = this.remoteStreamsByParticipant.delete(participant);
    if (globalThis.ephemeralVideoLogLevel.isDebugEnabled) {
      console.debug(`${CNAME}|doRemoveRemoteParticipant`, participant, deleted, this.remoteStreamsByParticipant.size);
    }
  }

  shareScreen() {
    // @ts-ignore (https://github.com/microsoft/TypeScript/issues/33232)
    navigator.mediaDevices.getDisplayMedia().then((mediaStream: MediaStream) => {
      this.localDisplayMediaStream = mediaStream;
      if (globalThis.ephemeralVideoLogLevel.isDebugEnabled) {
        console.debug(`${CNAME}|shareScreen getDisplayMedia`, mediaStream)
      }
      if (this.localParticipant) {
        this.localParticipant.publish(mediaStream, { topic: 'screen' })
      }
    }).catch((error: any) => {
      console.error(`${CNAME}|shareScreen`, error)
    });
  }

  // goHd() {
  //   if (this.localMediaStream) {
  //     this.localMediaStream.getTracks().forEach(track => {
  //       track.stop()
  //     })
  //   }

  //   navigator.mediaDevices.getUserMedia({
  //     video: { width: { exact: 1280 }, height: { exact: 720 } }
  //   }).then(mediaStream => {
  //     this.doStoreAndBindLocalMediaStream(mediaStream)
  //     if (this.localStream) {
  //       this.localStream.replaceMediaStream(mediaStream)
  //     }
  //   }).catch(error => {
  //     console.error(`${CNAME}|goHd`, error)
  //   });
  // }

  doApplyAudioConstraint(constraintName: string, value: ConstrainULong | ConstrainDouble | ConstrainBoolean | ConstrainDOMString) {
    if (this.localMediaStream) {
      this.localMediaStream.getAudioTracks().forEach(track => {
        const settings: MediaTrackSettings = track.getSettings();
        const constraints: any = settings;
        constraints[constraintName] = value;
        track.applyConstraints(constraints).then(() => {
          this.doGatherCapConstSettings()
        })
      })
    }
  }

  goHDByApplyConstraints() {
    //MediaStreamTrack should have method :
    //Promise<undefined> applyConstraints(optional MediaTrackConstraints constraints = {});
    if (this.localMediaStream) {
      this.localMediaStream.getVideoTracks().forEach(track => {
        const constraints: MediaTrackConstraints = { width: { exact: 1280 }, height: { exact: 720 } };
        track.applyConstraints(constraints).then(() => {
          if (globalThis.ephemeralVideoLogLevel.isDebugEnabled) {
            console.debug(`${CNAME}|applyConstraints done`, this.localMediaStream, constraints)
          }
          this.doGatherCapConstSettings()
        }).catch(error => {
          console.error(`${CNAME}|track.applyConstraints error`, error)
        })
      })
    }
  }

  frameRate24() {
    //MediaStreamTrack shoud have method :
    //Promise<undefined> applyConstraints(optional MediaTrackConstraints constraints = {});
    if (this.localMediaStream) {
      this.localMediaStream.getVideoTracks().forEach(track => {
        const constraints: MediaTrackConstraints = { frameRate: 24 };
        track.applyConstraints(constraints).then(() => {
          if (globalThis.ephemeralVideoLogLevel.isDebugEnabled) {
            console.debug(`${CNAME}|applyConstraints done`, this.localMediaStream, constraints)
          }
          this.doGatherCapConstSettings()
        }).catch(error => {
          console.error("applyConstraints error", error)
        })
      })
    }
  }

  // applyMediaStreamConstraintsHD(remoteStream: RemoteStream) {
  //   //const constraints: MediaStreamConstraints | any = ;
  //   //const constraints: MediaStreamConstraints = { video: { height: { exact: 720 }, width: { exact: 1280 }, advanced: [{ zoom: 4 }] } };
  //   //, advanced: [{ zoom: 2 }]
  //   remoteStream.applyMediaStreamConstraints({ video: { height: { exact: 720 }, width: { exact: 1280 }, advanced: [{ torch: true }] } })
  //     .then(() => {
  //       if (globalThis.logLevel.isDebugEnabled) {
  //         console.debug(`${CNAME}|applyMediaStreamConstraints done`);
  //       }
  //     })
  //     .catch((error: any) => {
  //       console.error(`${CNAME}|applyMediaStreamConstraints error`, error)
  //     });
  // }

  // applyMediaStreamConstraintsVGA(remoteStream: RemoteStream) {
  //   //const constraints: MediaStreamConstraints | any = ;
  //   //{ video: { zoom: 4 } }
  //   //{ video: { height: { exact: 480 }, width: { exact: 640 } } }
  //   remoteStream.applyMediaStreamConstraints({ video: { height: { exact: 480 }, width: { exact: 640 }, advanced: [{ torch: false }] } })
  //     .then(() => {
  //       if (globalThis.logLevel.isDebugEnabled) {
  //         console.debug(`${CNAME}|applyMediaStreamConstraints done`);
  //       }
  //     })
  //     .catch((error: any) => {
  //       console.error(`${CNAME}|applyMediaStreamConstraints error`, error)
  //     });
  // }

  mediaRecorder: MediaRecorder | undefined;
  recordedBlobs: Array<Blob> = new Array();

  record(mediaStream: MediaStream) {
    this.mediaRecorder = new MediaRecorder(mediaStream);
    this.mediaRecorder.onstop = (event: any) => {
      if (globalThis.ephemeralVideoLogLevel.isInfoEnabled) {
        console.info(`${CNAME}|Recorder stopped`, event)
      }
    };
    this.mediaRecorder.ondataavailable = (event: any) => {
      if (globalThis.ephemeralVideoLogLevel.isDebugEnabled) {
        console.debug(`${CNAME}|ondataavailable`, event)
      }
      if (event.data && event.data.size > 0) {
        this.recordedBlobs.push(event.data)
      }
    };
    this.mediaRecorder.start()
  }
  stopRecording() {
    this.mediaRecorder?.stop()
    setTimeout(() => {
      const blob = new Blob(this.recordedBlobs, { type: 'video/webm' });
      const url = window.URL.createObjectURL(blob);
      if (this.aRef) {
        const native = this.aRef.nativeElement;
        native.href = url;
        native.download = "video.webm";
      }
      this.aRef?.nativeElement.click()
      window.URL.revokeObjectURL(url)

      this.mediaRecorder = undefined;
    }, 1000)
  }

}
