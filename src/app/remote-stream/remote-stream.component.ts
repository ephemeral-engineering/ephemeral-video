import { Component, EventEmitter, Input, OnDestroy, OnInit, Output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
// import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltip } from '@angular/material/tooltip';

import { PublishOptions, RemoteStream, SubscribeOptions, receiveByChunks } from 'ephemeral-webrtc';

import { MediaStreamHelper } from '../MediaStreamHelper';
import { DATACHANNEL_SNAPSHOT_PATH } from '../constants';
import { ContextService } from '../context.service';
import { ControlledStreamComponent } from '../controlled-stream/controlled-stream.component';
import { GLOBAL_STATE } from '../global-state';

const CNAME = 'RemoteStream';

@Component({
  selector: 'app-remote-stream',
  templateUrl: './remote-stream.component.html',
  styleUrls: ['./remote-stream.component.css'],
  standalone: true,
  // MatProgressSpinnerModule
  imports: [MatButtonModule, MatChipsModule, MatIconModule, MatTooltip,
    ControlledStreamComponent]
})
export class RemoteStreamComponent implements OnInit, OnDestroy {

  readonly gstate = GLOBAL_STATE;

  _publishOptions: PublishOptions = { audio: false, video: false };
  _subscribeOptions: SubscribeOptions = { audio: false, video: false };

  _sinkId: string;

  audioEnabled = false;
  videoEnabled = false;

  _videoOnIcon = 'videocam';
  _videoOffIcon = 'videocam_off';

  constructor(private contextService: ContextService) {
    this.contextService.sinkId$.subscribe(id => {
      this._sinkId = id;
    });
  }

  _nickname = '';

  subscribed = true;

  on_participantData = (data: string) => {
    if (data.startsWith('n|')) {
      this._nickname = data.replace('n|', '');
    }
  };

  _onlineStatus = '';
  setOnlineStatus = (onlineStatus: string) => {
    this._onlineStatus = onlineStatus;
    this.contextService.recordNotification(`peer is ${onlineStatus}`)
  }

  _remoteStream: RemoteStream;
  @Input({ required: true }) set remoteStream(remoteStream: RemoteStream) {

    this._remoteStream = remoteStream;
    this._remoteStream.getParticipant().onData(this.on_participantData)

    const l_stream = this._remoteStream;

    this._publishOptions = l_stream.getPublishOptions();

    l_stream.onPublishOptionsUpdate(() => {
      this._publishOptions = l_stream.getPublishOptions();
    })

    this._subscribeOptions = l_stream.getSubscribeOptions();
    l_stream.onSubscribeOptionsUpdate(() => {
      this._subscribeOptions = l_stream.getSubscribeOptions();
    })

    this.mediaStream = this._remoteStream.getMediaStream();
    this._remoteStream.onMediaStream((mediaStream: MediaStream | undefined) => {
      if (globalThis.ephemeralVideoLogLevel.isDebugEnabled) {
        console.debug(`${CNAME}|onMediaStream`, mediaStream);
      }
      this.mediaStream = mediaStream;
    })

    const on_connectionStateChanged = (event: Event) => {
      const peerConnection = event.target as RTCPeerConnection;
      switch (peerConnection.connectionState) {
        case "new":
        case "connecting":
          this.setOnlineStatus("Connecting…");
          break;
        case "connected":
          this.setOnlineStatus("Online");
          break;
        case "disconnected":
          this.setOnlineStatus("Disconnecting…");
          break;
        case "closed":
          this.setOnlineStatus("Offline");
          break;
        case "failed":
          this.setOnlineStatus("Error");
          break;
        default:
          this.setOnlineStatus("Unknown");
          break;
      }
    };
    this._remoteStream.onPeerConnectionStateChanged(on_connectionStateChanged)
  }

  _mediaStreamInfo: any;//MediaStreamInfo;
  @Input() set mediaStreamInfo(info: any) {
    this._mediaStreamInfo = info;
  }

  _videoStyle: { [klass: string]: any; } = {};
  @Input() set videoStyle(style: { [klass: string]: any; }) {
    this._videoStyle = { ...this._videoStyle, ...style };
  }

  _mirror = false;
  @Input() set mirror(mirror: boolean) {
    this._mirror = mirror;
  }

  @Output() onSelect = new EventEmitter<void>();

  @Output() onSnapshot = new EventEmitter<string>();

  @Output() onToggleFlashlight = new EventEmitter<void>();

  private doUpdateStates() {
    this.audioEnabled = this._mediaStream ? MediaStreamHelper.isAudioEnabled(this._mediaStream) : false;
    this.videoEnabled = this._mediaStream ? MediaStreamHelper.isVideoEnabled(this._mediaStream) : false;
  }

  _mediaStream: MediaStream | undefined;
  set mediaStream(mediaStream: MediaStream | undefined) {
    this._mediaStream = mediaStream;
    this.doUpdateStates()
    if (this._mediaStream) {
      this._mediaStream.addEventListener('addtrack', (event: MediaStreamTrackEvent) => {
        if (globalThis.ephemeralVideoLogLevel.isDebugEnabled) {
          console.debug(`${CNAME}|MediaStream::onaddtrack`, event);
        }
        this.doUpdateStates()
      })

      // this._mediaStream.onremovetrack = (event: MediaStreamTrackEvent) => {
      //   if (globalThis.logLevel.isDebugEnabled) {
      //     console.debug(`${COMPONENT_NAME}|MediaStream::onremovetrack`, event);
      //   }
      //   this.doUpdateStates()
      // };
      // Best practice: (https://developer.mozilla.org/en-US/docs/Web/API/EventTarget/addEventListener)
      // to be able to register more than one listener
      this._mediaStream.addEventListener('removetrack', (event: MediaStreamTrackEvent) => {
        if (globalThis.ephemeralVideoLogLevel.isDebugEnabled) {
          console.debug(`${CNAME}|MediaStream::onremovetrack`, event);
        }
        this.doUpdateStates()
      })
    }
  }

  ngOnInit(): void { }

  ngOnDestroy(): void {
    if (this._remoteStream) {
      this._remoteStream.getParticipant().offData(this.on_participantData);
    }
  }

  // onPointerDown(event: PointerEvent) {
  //   // https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events
  //   if (globalThis.logLevel.isDebugEnabled) {
  //     console.log('onPointerDown', event)
  //   }
  //   this._remoteStream?.sendData({ x: event.clientX, y: event.clientY })
  // }

  snapshotInPrgs = false;

  snapshot() {
    this.snapshotInPrgs = true;
    const dataChannel = this._remoteStream.createDataChannel(DATACHANNEL_SNAPSHOT_PATH);
    // this._remoteStream?.singlecast(DATACHANNEL_SNAPSHOT_PATH, (dataChannel) => {
    // dataChannel.onopen = (event) => {
    //   if (globalThis.logLevel.isDebugEnabled) {
    //     console.debug(`${CNAME}|snapshot dataChannel.onopen`, this, event);
    //   }
    // };
    // Store to keep a reference, otherwise the instance might be garbage collected
    // I had some weird issues with snapshots not always working, I suspected garbage collection.
    // I tried to store references in a set, and it seems to fix the issue. Let's see if the problem
    // is really fixed. 
    //this.snapshotDataChannels.add(dataChannel)

    receiveByChunks(dataChannel).then((dataUrl) => {
      this.onSnapshot.emit(dataUrl)
      dataChannel.close()
      this.snapshotInPrgs = false;
    })

    const doHandleErrorClose = (event: Event) => {
      if (globalThis.ephemeralVideoLogLevel.isDebugEnabled) {
        console.debug(`${CNAME}|dataChannel:onclose/onerror`, DATACHANNEL_SNAPSHOT_PATH, event);
      }
      this.snapshotInPrgs = false;
    };

    dataChannel.onclose = doHandleErrorClose;
    dataChannel.onerror = doHandleErrorClose;
    // })
  }

  toggleSubscribe() {
    if (this.subscribed) {
      this._remoteStream?.unsubscribe()
      this.subscribed = false;
    } else {
      this.subscribed = this._remoteStream?.subscribe(this._remoteStream.getSubscribeOptions())
    }

  }

  togglePublishAudio() {
    this._remoteStream?.updatePublishOptions({ audio: !this._remoteStream.getPublishOptions().audio })
      .then(() => { })
  }

  togglePublishVideo() {
    this._remoteStream?.updatePublishOptions({ video: !this._remoteStream.getPublishOptions().video })
      .then(() => { })
  }

  toggleSubscribeAudio() {
    this._remoteStream?.updateSubscribeOptions({ audio: !this._remoteStream.getSubscribeOptions().audio })
  }

  toggleSubscribeVideo() {
    this._remoteStream?.updateSubscribeOptions({ video: !this._remoteStream.getSubscribeOptions().video })
  }

  toggleFlashlight() {
    this.onToggleFlashlight.emit()
  }

  select() {
    this.onSelect.emit()
  }

  // toggleAudio() {
  //   if (this._mediaStream) {
  //     if (MediaStreamHelper.isAudioEnabled(this._mediaStream)) {
  //       MediaStreamHelper.disableAudio(this._mediaStream);
  //     } else {
  //       MediaStreamHelper.enableAudio(this._mediaStream);
  //     }
  //     this.audioEnabled = MediaStreamHelper.isAudioEnabled(this._mediaStream);
  //   }
  // }

  // toggleVideo() {
  //   if (this._mediaStream) {
  //     if (MediaStreamHelper.isVideoEnabled(this._mediaStream)) {
  //       MediaStreamHelper.disableVideo(this._mediaStream);
  //     } else {
  //       MediaStreamHelper.enableVideo(this._mediaStream);
  //     }
  //     this.videoEnabled = MediaStreamHelper.isVideoEnabled(this._mediaStream);
  //   }
  // }

}
