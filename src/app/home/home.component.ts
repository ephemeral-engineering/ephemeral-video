import { ClipboardModule } from '@angular/cdk/clipboard';
import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import { JsonPipe, KeyValuePipe, NgClass, NgStyle } from '@angular/common';
import { AfterViewInit, Component, ElementRef, HostListener, Inject, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { FormsModule, UntypedFormBuilder, UntypedFormControl, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltip } from '@angular/material/tooltip';
import { ActivatedRoute } from "@angular/router";

import { setLogLevel as setEphClientLogLevel } from 'ephemeral-client';
import { setLogLevel as setEphWebRtcLogLevel } from 'ephemeral-webrtc';

import { Conversation, ConversationOptions, LocalParticipant, LocalStream, RemoteParticipant, RemoteStream, Stream, sendByChunksWithDelayPromise } from 'ephemeral-webrtc';

import { saveAs } from 'file-saver-es';

import { LogLevelText, setLogLevel } from 'src/logLevel';
import { MediaStreamHelper, MediaStreamInfo } from '../MediaStreamHelper';
import { AlertComponent } from '../alert/alert.component';
import { getSessionStorage, removeQueryParam, setSessionStorage } from '../common';
import { DATACHANNEL_MEDIASTREAMSETTINGS_PATH, DATACHANNEL_SNAPSHOT_PATH, FRAME_RATES, RESOLUTIONS, STORAGE_PREFIX, TOPIC_SCREEN } from '../constants';
import { ContextService } from '../context.service';
import { FilterOutPipe } from '../filter-out.pipe';
import { GLOBAL_STATE } from '../global-state';
import { LocalStreamComponent } from '../local-stream/local-stream.component';
import { MessageType, MessagesService } from '../messages.service';
import { RemoteStreamComponent } from '../remote-stream/remote-stream.component';
import { RemovePipe } from '../remove.pipe';
import { WINDOW } from '../windows-provider';

interface UserData {
  nickname: string
  // isModerator: boolean
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
  imports: [NgClass, NgStyle,
    RemovePipe, JsonPipe,
    ClipboardModule, AlertComponent, LocalStreamComponent, RemoteStreamComponent, MatButtonModule, MatIconModule, MatTooltip, FormsModule, MatFormFieldModule, MatInputModule, MatSelectModule, KeyValuePipe, FilterOutPipe]
})
export class HomeComponent implements AfterViewInit, OnInit, OnDestroy {

  readonly gstate = GLOBAL_STATE;

  conversation: Conversation | undefined;

  // Messages (defined as an array of tuples)
  public readonly messages: Array<[UserData, Message]> = new Array();

  readonly remoteParticipants: Set<RemoteParticipant> = new Set();

  _error: string;

  messageFormGroup = this.fb.group({
    message: this.fb.control('', [Validators.required])
  });
  get messageFc(): UntypedFormControl {
    return this.messageFormGroup.get('message') as UntypedFormControl;
  }

  get nickname() {
    return this.gstate.nickname || '';
  }
  set nickname(value: string) {
    this.localParticipant?.shareData(`n|${value}`)
    this.gstate.nickname = value;
    setSessionStorage(`${STORAGE_PREFIX}-nickname`, value)
  }

  // readonly year: number = new Date().getFullYear();

  url: string | undefined;

  localParticipant: LocalParticipant | undefined;

  localUserMediaStream: MediaStream | undefined;
  localStream: LocalStream | undefined;

  localDisplayMediaStream: MediaStream | undefined;
  localDisplayStream: LocalStream | undefined;

  localStreams: Array<LocalStream> = new Array();

  remoteStreamsByParticipant: Map<RemoteParticipant, Set<RemoteStream>> = new Map();
  remoteStreams: Set<RemoteStream> = new Set();

  mediaStreamInfos: Map<Stream, MediaStreamInfo> = new Map();

  isWaitingForAcceptance = false;

  _notifications: string[] = new Array();

  bandwidthByPeerId: Map<string, number> = new Map();
  averageBandwidth: number = 0;

  isHandsetPortrait = false;

  communicationStarted = false;

  selectedStream: LocalStream | undefined;
  selectedRemoteStream: RemoteStream | undefined;

  settingsDataChannelsByLocalStreams: Map<LocalStream, Set<RTCDataChannel>> = new Map();
  settingsDataChannelByRemoteStreams: Map<RemoteStream, RTCDataChannel> = new Map();

  grabbing: boolean = false;
  audioInMediaDevices: MediaDeviceInfo[];
  videoInMediaDevices: MediaDeviceInfo[];
  audioOutMediaDevices: MediaDeviceInfo[];

  resolutions: number[] = RESOLUTIONS;
  frameRates: number[] = FRAME_RATES;

  // mainRemoteStreams: Set<RemoteStream> = new Set();

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
    // event.returnValue = true;
  }

  constructor(@Inject(WINDOW) public window: Window,
    private activatedRoute: ActivatedRoute,
    public contextService: ContextService,
    private messagesService: MessagesService,
    private fb: UntypedFormBuilder,
    private responsive: BreakpointObserver,
    private _snackBar: MatSnackBar
  ) {

    const logLevel = (this.activatedRoute.snapshot.queryParamMap.get('log') || 'warn') as LogLevelText;
    if (logLevel) {
      setLogLevel(logLevel)
      setEphClientLogLevel(logLevel)
      setEphWebRtcLogLevel(logLevel)
    }

    this.gstate.monitor = /^true$/i.test(this.activatedRoute.snapshot.queryParamMap.get('mon') || 'false');
  }

  ngOnInit(): void {

    this.responsive.observe([
      Breakpoints.TabletPortrait,
      Breakpoints.HandsetLandscape,
      Breakpoints.HandsetPortrait])
      .subscribe(result => {
        const breakpoints = result.breakpoints;
        this.isHandsetPortrait = false;
        if (globalThis.ephemeralVideoLogLevel.isDebugEnabled) {
          console.debug("responsive subscribe", result);
        }

        if (breakpoints[Breakpoints.TabletPortrait]) {
          console.log("screens matches TabletPortrait");
        } else if (breakpoints[Breakpoints.HandsetLandscape]) {
          console.log("screens matches HandsetLandscape");
        } else if (breakpoints[Breakpoints.HandsetPortrait]) {
          console.log("screens matches HandsetPortrait");
          this.isHandsetPortrait = true;
        }
      });

    const hash = this.activatedRoute.snapshot.queryParamMap.get('hash') as string || undefined;

    this.contextService.notifications$.subscribe(status => {
      this._notifications.push(`${new Date().toLocaleTimeString()}: ${status}`)
    });

    // Get conversation name and base url from current path (pattern : "/path/to/<conversationId>")
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
      moderated: false
    };

    Conversation.getOrCreate(conversationId, hash, options).then((conversation: Conversation) => {
      if (globalThis.ephemeralVideoLogLevel.isInfoEnabled) {
        console.log(`${CNAME}|Conversation`, conversation)
      }

      this.conversation = conversation;

      // Replace url, keeping all search parameters but 'hash' to prevent re-hash of the initially obtained id at each refresh.
      window.history.replaceState({}, '', `${baseUrl}/${conversation.id}${removeQueryParam(window.location.search, 'hash')}`)

      // Listen to Conversation events
      //
      conversation.onConnectionStatus = (status: string) => {
        this._notifications.push(`${new Date().toLocaleTimeString()}: Server ${status}`);
      }

      conversation.onBandwidth = (peerId: string, speedKbps: number, average: number) => {
        this.bandwidthByPeerId.set(peerId, speedKbps)
        this.averageBandwidth = average;
      };

      conversation.onParticipantAdded = (participant: RemoteParticipant) => {
        if (globalThis.ephemeralVideoLogLevel.isDebugEnabled) {
          console.debug(`${CNAME}|onParticipantAdded`, participant)
        }

        this.remoteParticipants.add(participant);

        this.localParticipant?.shareData(`n|${this.gstate.nickname}`, participant.peerId)

        participant.onStreamPublished((stream: RemoteStream) => {
          if (globalThis.ephemeralVideoLogLevel.isInfoEnabled) {
            console.log(`${CNAME}|onStreamPublished`, participant, stream)
          }
          // Store
          this.doStoreRemoteStreamByParticipant(participant, stream)
          // And subscribe
          stream.subscribe() // or 
          //stream.subscribe({ audio: true, video: false })

          // and also setup channel for 'subscribing' to MediaStreamInfo changes and change settings (using constraints)
          this.setupRemoteStreamSettingsDataChannel(stream)

          if (!this.communicationStarted) {
            this.communicationStarted = true;
            this.messagesService.postMessage({
              type: MessageType.CommunicationStarted,
            })
          }

        })
        participant.onStreamUnpublished((stream: RemoteStream) => {
          if (globalThis.ephemeralVideoLogLevel.isInfoEnabled) {
            console.log(`${CNAME}|onStreamUnpublished`, participant, stream)
          }
          this.doRemoveMediaStream(participant, stream)

          // and cleanup associated datachannel
          const dc = this.settingsDataChannelByRemoteStreams.get(stream);
          if (dc) {
            dc.close()
          }
          this.settingsDataChannelByRemoteStreams.delete(stream)
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

      // Enter the conversation
      if (globalThis.ephemeralVideoLogLevel.isDebugEnabled) {
        console.debug(`${CNAME}|joining`)
      }
      this.isWaitingForAcceptance = true;
      conversation.getOrCreateParticipant().then((participant: LocalParticipant) => {
        if (globalThis.ephemeralVideoLogLevel.isInfoEnabled) {
          console.log(`${CNAME}|addParticipant succeed`, participant)
        }
        this.isWaitingForAcceptance = false;
        this.localParticipant = participant;

        this.localParticipant.shareData(`n|${this.gstate.nickname}`)

        this.publish()
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
      this._error = error;
    })
  }

  select(stream?: LocalStream | RemoteStream) {
    if (stream instanceof LocalStream) {
      this.selectedRemoteStream = undefined;
      this.selectedStream = stream;
    }
    else {
      this.selectedRemoteStream = stream;
      this.selectedStream = undefined;
    }
  }

  // Sets up a channel to both receive MediaStreamInfo from RemoteStream publisher,
  // and send 'constraints' to RemoteStream publisher in order to remote control its MediaStream settings.
  setupRemoteStreamSettingsDataChannel(stream: RemoteStream) {

    const dataChannel = stream.createDataChannel(DATACHANNEL_MEDIASTREAMSETTINGS_PATH);

    dataChannel.onopen = (event) => {
      if (globalThis.ephemeralVideoLogLevel.isDebugEnabled) {
        console.debug(`${CNAME}|dataChannel:onopen`, DATACHANNEL_MEDIASTREAMSETTINGS_PATH, event);
      }
      // store datachannel for push message
      this.settingsDataChannelByRemoteStreams.set(stream, dataChannel)
    };
    dataChannel.onmessage = (event) => {
      if (globalThis.ephemeralVideoLogLevel.isDebugEnabled) {
        console.debug(`${CNAME}|dataChannel:onmessage`, DATACHANNEL_MEDIASTREAMSETTINGS_PATH, event);
      }
      const info = JSON.parse(event.data) as MediaStreamInfo;
      this.mediaStreamInfos.set(stream, info)
    };
    dataChannel.onclose = (event) => {
      if (globalThis.ephemeralVideoLogLevel.isDebugEnabled) {
        console.debug(`${CNAME}|dataChannel:onclose`, DATACHANNEL_MEDIASTREAMSETTINGS_PATH, event);
      }
      this.settingsDataChannelByRemoteStreams.delete(stream)
      this.mediaStreamInfos.delete(stream)
    }
    dataChannel.onerror = (event) => {
      if (globalThis.ephemeralVideoLogLevel.isDebugEnabled) {
        console.debug(`${CNAME}|dataChannel:onerror`, DATACHANNEL_MEDIASTREAMSETTINGS_PATH, event);
      }
    };
  }

  notifyMediaStreamInfoChanged(stream: LocalStream, infos: MediaStreamInfo) {
    this.settingsDataChannelsByLocalStreams.get(stream)?.forEach((dataChannel) => {
      dataChannel.send(JSON.stringify(infos))
    })
  }

  updateMediaStreamInfo(stream: LocalStream) {
    const infos = MediaStreamHelper.getMediaStreamInfo(stream.getMediaStream());
    this.mediaStreamInfos.set(stream, infos)
    this.notifyMediaStreamInfoChanged(stream, infos)
  }

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
        ...this.selectedAudioDeviceId ? { deviceId: this.selectedAudioDeviceId } : {},
      };

      const videoConstraints = {
        // ...supportedConstraints['width'] ? { width: { min: 640, ideal: 1280, max: 4000 } } : {},
        // Note: Specifying only height, width seems to adapt in consequence
        // Note: Using min and ideal sometimes does not work, the browser (chrome) selects min instead of ideal.
        // specifying directly the selected number seems to work better
        // { min: 480, ideal: this.selectedVideoResolution } 
        // { exact: this.selectedVideoResolution } make it fail if not possible
        // ...supportedConstraints['width'] ? { width: this.selectedVideoResolution[0] } : {},
        ...supportedConstraints['height'] ? { height: this.selectedVideoResolution } : {},
        // aspectRatio: 1.777777778,
        ...supportedConstraints['frameRate'] ? { frameRate: this.selectedVideoFrameRate } : {}, //{ ideal: 30, max: 60 }
        // facingMode: { exact: "user" },
        ...this.selectedVideoDeviceId ? { deviceId: this.selectedVideoDeviceId } : {},
      };

      if (globalThis.ephemeralVideoLogLevel.isDebugEnabled) {
        console.debug(`${CNAME}|navigator.mediaDevices`, navigator.mediaDevices)
      }
      navigator.mediaDevices.getUserMedia({ audio: audioConstraints, video: videoConstraints })
        .then((mediaStream: MediaStream) => {
          if (globalThis.ephemeralVideoLogLevel.isDebugEnabled) {
            console.debug(`${CNAME}|getUserMedia`, mediaStream)
          }

          this.localUserMediaStream = mediaStream;

          const mediaStreamInfo = MediaStreamHelper.getMediaStreamInfo(mediaStream);

          if (mediaStreamInfo.video?.capabilities?.height?.max) {
            // const maxW = mediaStreamInfo.video?.capabilities?.width?.max;
            const maxH = mediaStreamInfo.video?.capabilities?.height?.max;
            this.resolutions = RESOLUTIONS.filter((r) => r <= maxH);
            const last = this.resolutions.slice(-1)[0] || -1;
            if (last < maxH) {
              this.resolutions.push(maxH);
            }
          }
          if (mediaStreamInfo.video?.capabilities?.frameRate?.max) {
            const max = mediaStreamInfo.video?.capabilities?.frameRate?.max;
            this.frameRates = FRAME_RATES.filter((r) => r <= max);
            const last = this.frameRates.slice(-1)[0] || -1;
            if (last < max) {
              this.frameRates.push(max);
            }
          }

          if (this.localStream) {
            this.localStream.replaceMediaStream(mediaStream)
          } else {
            this.publish()
          }
          resolve()
        }).catch((error) => {
          console.error(`${CNAME}|getUserMedia`, error)
          this._error = error;
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

  copyLinkSnackBar(copied: boolean) {
    this._snackBar.open(copied ? 'Link copied to clipboard' : 'Failed to copy link', 'Ok', { duration: 2000, verticalPosition: 'top' });
  }

  _selectedAudioDeviceId = getSessionStorage(`${STORAGE_PREFIX}-audioDeviceId`);
  set selectedAudioDeviceId(id: string) {
    // For device change, need to go through getUserMedia
    this.grabbing = true;
    this._selectedAudioDeviceId = id;
    this.getUserMedia().then(() => {
      setSessionStorage(`${STORAGE_PREFIX}-audioDeviceId`, id)
    }).catch(() => {
      this._selectedAudioDeviceId = "";
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
    // For device change, need to go through getUserMedia
    this.grabbing = true;
    this._selectedVideoDeviceId = id;
    this.getUserMedia().then(() => {
      setSessionStorage(`${STORAGE_PREFIX}-videoDeviceId`, `${id}`)
    }).catch(() => {
      this._selectedVideoDeviceId = "";
    }).finally(() => {
      this.grabbing = false;
    })
  }
  get selectedVideoDeviceId() {
    return this._selectedVideoDeviceId || "";
  }

  _selectedVideoResolution: number = +(getSessionStorage(`${STORAGE_PREFIX}-videoResolution`) || "480");
  set selectedVideoResolution(resolution: number) {
    if (globalThis.ephemeralVideoLogLevel.isDebugEnabled) {
      console.debug(`${CNAME}|set selectedVideoResolution`, resolution)
    }
    this.grabbing = true;

    // On Chrome, this is better to first stop the video track
    // because if a lower resolution value was used initially, then it fails
    // to grab a higher one...
    // if (this.localMediaStream && navigator.userAgent.indexOf("Chrome") > -1
    //   && this._selectedVideoResolution < resolution) {
    //   const videoTrack = this.localMediaStream.getVideoTracks()[0];
    //   videoTrack.stop()
    //   // this.localMediaStream.removeTrack(videoTrack);
    // }
    // => Not needed anymore as we now directly applyConstraints on the video track
    // instead of going through getUserMedia again !

    this._selectedVideoResolution = resolution;

    // For resolution change, directly applyConstraints on track
    this.localUserMediaStream?.getVideoTracks()[0].applyConstraints({
      height: this.selectedVideoResolution,
    }).then(() => {
      if (globalThis.ephemeralVideoLogLevel.isDebugEnabled) {
        console.debug(`${CNAME}|set selectedVideoResolution done`, resolution)
      }
      // store chosen videoResolution
      setSessionStorage(`${STORAGE_PREFIX}-videoResolution`, `${resolution}`)
      // and update stream info
      if (this.localStream) {
        this.updateMediaStreamInfo(this.localStream)
      }
    }).catch((error) => {
      console.error(`${CNAME}|set selectedVideoResolution`, error)
    }).finally(() => {
      this.grabbing = false;
    })
  }
  get selectedVideoResolution() {
    return this._selectedVideoResolution;
  }

  _selectedVideoFrameRate = +(getSessionStorage(`${STORAGE_PREFIX}-videoFrameRate`) || "24");
  set selectedVideoFrameRate(frameRate: number) {
    if (globalThis.ephemeralVideoLogLevel.isDebugEnabled) {
      console.debug(`${CNAME}|set selectedVideoFrameRate`, frameRate)
    }
    this.grabbing = true;
    this._selectedVideoFrameRate = frameRate;

    // For resolution change, directly applyConstraints on track
    this.localUserMediaStream?.getVideoTracks()[0].applyConstraints({
      frameRate: this.selectedVideoFrameRate
    }).then(() => {
      setSessionStorage(`${STORAGE_PREFIX}-videoFrameRate`, `${frameRate}`)
      if (this.localStream) {
        this.updateMediaStreamInfo(this.localStream)
      }
    }).finally(() => {
      this.grabbing = false;
    })
  }
  get selectedVideoFrameRate() {
    return this._selectedVideoFrameRate;
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

  ngOnDestroy(): void {
    this.doCleanUp()
  }

  private doCleanUp() {
    if (this.conversation) {
      this.conversation.close()
      this.conversation = undefined;
    }
  }

  publish() {
    if (this.localUserMediaStream && this.localParticipant) {
      this.localParticipant.publish(this.localUserMediaStream, { topic: 'webcam', audio: true }).then((localStream) => {
        this.localStream = localStream;
        this.updateMediaStreamInfo(localStream)

        localStream.onMediaStream((_mediaStream) => {
          this.updateMediaStreamInfo(localStream)
        })

        localStream.onDataChannel(DATACHANNEL_SNAPSHOT_PATH, (dataChannel: RTCDataChannel) => {

          // Store to keep a reference, otherwise the instance might be garbage collected
          // I had some weird issues with snapshots not always working, I suspected garbage collection.
          // I tried to store references in a set, and it seems to fix the issue. Let's see if the problem
          // is really fixed.
          // Actually it was, but by encapsulating the recursive sendByChunksWithDelay in a Promise the problem
          // is also fixed and there is no need for a Set to keep references.
          //this.snapshotDataChannels.add(dataChannel)

          dataChannel.onopen = (event) => {
            if (globalThis.ephemeralVideoLogLevel.isDebugEnabled) {
              console.debug(`${CNAME}|dataChannel:onopen`, DATACHANNEL_SNAPSHOT_PATH, event)
            }
            localStream.snapshot().then((dataUrl: string) => {
              // https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Using_data_channels
              // Error with:
              // dataChannel.send(dataUrl) // TypeError: RTCDataChannel.send: Message size (534010) exceeds maxMessageSize
              // Divide dataUrl in chunks and send them one by one.
              // let start = 0;
              // while (start < dataUrl.length) {
              //   const end = Math.min(dataUrl.length, start + DATACHANNEL_SNAPSHOT_CHUNK_SIZE);
              //   dataChannel.send(dataUrl.slice(start, end))
              //   start = end;
              // }
              // dataChannel.send(DATACHANNEL_SNAPSHOT_END)
              if (globalThis.ephemeralVideoLogLevel.isDebugEnabled) {
                console.debug(`${CNAME}|datachannel sending snapshot`, dataUrl)
              }

              // sendByChunks(dataChannel, dataUrl) // works
              // sendByChunksWithDelay(dataChannel, dataUrl) // recursive function that triggers dataChannel garbage collection issues 
              // Promise version is the most reliable
              sendByChunksWithDelayPromise(dataChannel, dataUrl).then(() => {
                if (globalThis.ephemeralVideoLogLevel.isDebugEnabled) {
                  console.debug(`${CNAME}|datachannel snapshot sent`)
                }
              })
            })
          };
          dataChannel.onclose = (event) => {
            if (globalThis.ephemeralVideoLogLevel.isDebugEnabled) {
              console.debug(`${CNAME}|datachannel:onclose`, DATACHANNEL_SNAPSHOT_PATH, event)
            }
          };
          dataChannel.onerror = (event) => {
            if (globalThis.ephemeralVideoLogLevel.isDebugEnabled) {
              console.debug(`${CNAME}|datachannel:onerror`, DATACHANNEL_SNAPSHOT_PATH, event)
            }
          };
        })

        // Handle channel to both send MediaStreamInfo from subscribers,
        // and receive 'constraints' from subscriber in order to apply them.
        localStream.onDataChannel(DATACHANNEL_MEDIASTREAMSETTINGS_PATH, (dataChannel: RTCDataChannel) => {
          dataChannel.onopen = (event) => {
            if (globalThis.ephemeralVideoLogLevel.isDebugEnabled) {
              console.debug(`${CNAME}|dataChannel:onopen`, DATACHANNEL_MEDIASTREAMSETTINGS_PATH, event)
            }

            // store datachannel for push notifications
            if (!this.settingsDataChannelsByLocalStreams.has(localStream)) {
              this.settingsDataChannelsByLocalStreams.set(localStream, new Set())
            }
            this.settingsDataChannelsByLocalStreams.get(localStream)?.add(dataChannel)

            // and immediately push
            this.updateMediaStreamInfo(localStream)
          };
          dataChannel.onmessage = (event) => {
            if (globalThis.ephemeralVideoLogLevel.isDebugEnabled) {
              console.debug(`${CNAME}|dataChannel:onmessage`, DATACHANNEL_MEDIASTREAMSETTINGS_PATH, event)
            }
            const constraints = JSON.parse(event.data) as MediaStreamConstraints;
            const mediaStream = localStream.getMediaStream();
            if (mediaStream) {
              MediaStreamHelper.applyConstraints(mediaStream, constraints).finally(() => {
                this.updateMediaStreamInfo(localStream)
              })
            }
          };
          dataChannel.onclose = (event) => {
            if (globalThis.ephemeralVideoLogLevel.isDebugEnabled) {
              console.debug(`${CNAME}|datachannel:onclose`, DATACHANNEL_MEDIASTREAMSETTINGS_PATH, event)
            }
            this.settingsDataChannelsByLocalStreams.get(localStream)?.delete(dataChannel)
          };
          dataChannel.onerror = (event) => {
            if (globalThis.ephemeralVideoLogLevel.isDebugEnabled) {
              console.debug(`${CNAME}|datachannel:onerror`, DATACHANNEL_MEDIASTREAMSETTINGS_PATH, event)
            }
          };
        })
      });
    } else {
      console.error(`${CNAME}|Cannot publish`, this.localUserMediaStream, this.localParticipant)
    }
  }

  toggleFlashlight(localStream: LocalStream) {
    if (globalThis.ephemeralVideoLogLevel.isDebugEnabled) {
      console.debug(`${CNAME}|toggleFlashlight on stream<${localStream.id}`, localStream, this.mediaStreamInfos.get(localStream))
    }
    // https://www.oberhofer.co/mediastreamtrack-and-its-capabilities/ 
    const l_torch = !(this.mediaStreamInfos.get(localStream)?.video?.settings as any).torch;
    localStream.getMediaStream().getVideoTracks().forEach((track: MediaStreamTrack) => {
      track.applyConstraints({
        torch: l_torch,
        advanced: [{ torch: l_torch }]
      } as any)
        .then(() => {
          // broadcast new MediaStreamInfo to all subscribers
          this.updateMediaStreamInfo(localStream)
        })
        .catch(event => {
          if (globalThis.ephemeralVideoLogLevel.isWarnEnabled) {
            console.warn(`${CNAME}|toggleFlashlight error`, event)
          }
        });
    })
  }

  toggleRemoteFlashlight(remoteStream: RemoteStream) {
    if (globalThis.ephemeralVideoLogLevel.isDebugEnabled) {
      console.debug(`${CNAME}|toggleRemoteFlashlight on stream<${remoteStream.id}`, remoteStream, this.mediaStreamInfos.get(remoteStream))
    }
    const l_torch = !(this.mediaStreamInfos.get(remoteStream)?.video?.settings as any).torch;
    this.settingsDataChannelByRemoteStreams.get(remoteStream)?.send(JSON.stringify({
      video: {
        torch: l_torch,
        advanced: [{ torch: l_torch }]
      }
    } as any)) // should be MediaStreamConstraints but 'torch' is not yet standardized as a property
  }

  unpublish() {
    if (this.localUserMediaStream) {
      this.localParticipant?.unpublish(this.localUserMediaStream)
      this.localStream = undefined;
    }
  }

  private doStoreRemoteStreamByParticipant(participant: RemoteParticipant, stream: RemoteStream) {
    if (!this.remoteStreamsByParticipant.has(participant)) {
      this.remoteStreamsByParticipant.set(participant, new Set())
    }
    this.remoteStreamsByParticipant.get(participant)?.add(stream)
    this.remoteStreams.add(stream)
  }

  private doRemoveMediaStream(participant: RemoteParticipant, stream: RemoteStream) {
    const deleted = this.remoteStreamsByParticipant.get(participant)?.delete(stream);
    if (globalThis.ephemeralVideoLogLevel.isDebugEnabled) {
      console.debug(`${CNAME}|doRemoveMediaStream`, participant, stream, deleted)
    }
    this.remoteStreams.delete(stream)
  }

  private doRemoveRemoteParticipant(participant: RemoteParticipant) {
    this.remoteParticipants.delete(participant);
    const participantStreams = this.remoteStreamsByParticipant.get(participant);
    const deleted = this.remoteStreamsByParticipant.delete(participant);
    if (globalThis.ephemeralVideoLogLevel.isDebugEnabled) {
      console.debug(`${CNAME}|doRemoveRemoteParticipant`, participant, deleted, this.remoteStreamsByParticipant.size)
    }
    participantStreams?.forEach((stream) => { this.remoteStreams.delete(stream) })
  }

  grabbingDisplayMedia = false;

  toggleScreenShare() {
    // const options = {
    //   video: {
    //     displaySurface: "browser",
    //   },
    //   // audio: {
    //   //   suppressLocalAudioPlayback: false,// experimental
    //   // },
    //   // preferCurrentTab: false,
    //   // selfBrowserSurface: "exclude",
    //   // systemAudio: "include",
    //   // surfaceSwitching: "include",
    //   // monitorTypeSurfaces: "include",
    // };
    if (this.localDisplayStream) {
      this.localParticipant?.unpublish(this.localDisplayStream)
      // Must force tracks to stop to stop screen sharing
      this.localDisplayMediaStream?.getTracks().forEach(track => track.stop())
      this.localDisplayMediaStream = undefined;
      this.localDisplayStream = undefined;
    } else {
      this.grabbingDisplayMedia = true;
      navigator.mediaDevices.getDisplayMedia().then((mediaStream: MediaStream) => {
        if (globalThis.ephemeralVideoLogLevel.isDebugEnabled) {
          console.debug(`${CNAME}|shareScreen getDisplayMedia`, mediaStream)
        }
        this.localDisplayMediaStream = mediaStream;

        mediaStream.getVideoTracks()[0].onended = () => {
          this.localParticipant?.unpublish(mediaStream)
          this.localDisplayMediaStream = undefined;
          this.localDisplayStream = undefined;
        };

        if (this.localDisplayStream) {
          this.localDisplayStream.replaceMediaStream(mediaStream)
        } else if (this.localDisplayMediaStream && this.localParticipant) {
          // TODO allow to share audio ? how does it work ?
          this.localParticipant.publish(this.localDisplayMediaStream, { topic: TOPIC_SCREEN, audio: false })
            .then((localStream) => {
              this.localDisplayStream = localStream;
            })
        }
      }).catch((error: any) => {
        console.error(`${CNAME}|shareScreen`, error)
      }).finally(() => {
        this.grabbingDisplayMedia = false;
      })
    }
  }

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

  // blurredMediaStream: MediaStream | undefined;
  // blur() {
  //   if (this.localStream && this.localUserMediaStream) {
  //     this.blurredMediaStream = this.localUserMediaStream;
  //     this.localUserMediaStream = MediaStreamHelper.blur(this.localUserMediaStream);
  //     this.localStream.replaceMediaStream(this.localUserMediaStream)
  //   }
  // }

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
}

