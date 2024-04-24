import { NgIf, NgStyle } from '@angular/common';
import { Component, HostBinding, Input, OnInit } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

import { LocalStream, PublishOptions, sendByChunksWithDelayPromise } from 'ephemeral-webrtc';

import { MediaStreamHelper, MediaStreamInfo } from '../MediaStreamHelper';
import { DATACHANNEL_CONSTRAINTS_PATH, DATACHANNEL_SNAPSHOT_PATH } from '../constants';
import { ControlledStreamComponent } from '../controlled-stream/controlled-stream.component';

const CNAME = 'LocalStream';

@Component({
  selector: 'app-local-stream',
  templateUrl: './local-stream.component.html',
  styleUrls: ['./local-stream.component.css'],
  standalone: true,
  imports: [NgIf, NgStyle,
    ControlledStreamComponent, MatButtonModule, MatIconModule],
})
export class LocalStreamComponent implements OnInit {

  _publishOptions: PublishOptions = { audio: false, video: false };

  // audioEnabled = false;
  // videoEnabled = false;

  _localStream: LocalStream;
  @Input({ required: true }) set localStream(localStream: LocalStream) {
    this._localStream = localStream;

    if (localStream) {
      this._publishOptions = localStream.getPublishOptions();

      localStream.onPublishOptionsUpdate(() => {
        this._publishOptions = localStream.getPublishOptions();
      })

      this.mediaStream = localStream.getMediaStream();
      localStream.onMediaStream((mediaStream) => {
        this.mediaStream = mediaStream;
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

      localStream.onDataChannel(DATACHANNEL_CONSTRAINTS_PATH, (dataChannel: RTCDataChannel) => {
        dataChannel.onopen = (event) => {
          if (globalThis.ephemeralVideoLogLevel.isDebugEnabled) {
            console.debug(`${CNAME}|dataChannel:onopen`, DATACHANNEL_CONSTRAINTS_PATH, event)
          }
        };
        dataChannel.onmessage = (event) => {
          if (globalThis.ephemeralVideoLogLevel.isDebugEnabled) {
            console.debug(`${CNAME}|dataChannel:onmessage`, DATACHANNEL_CONSTRAINTS_PATH, event)
          }
          const constraints = JSON.parse(event.data) as MediaStreamConstraints;
          if (this._mediaStream) {
            MediaStreamHelper.applyConstraints(this._mediaStream, constraints)
          }
          // closing datachannel now
          // TODO think about a way to reuse datachannel, instead of
          // this could be part of a generic development in ephemeral-webrtc.. ?
          dataChannel.close()
        };
        dataChannel.onclose = (event) => {
          if (globalThis.ephemeralVideoLogLevel.isDebugEnabled) {
            console.debug(`${CNAME}|dataChannel:onclose`, DATACHANNEL_CONSTRAINTS_PATH, event)
          }
        };
      })
    }
  }

  _videoStyle: { [klass: string]: any; } = {};
  @Input() set videoStyle(style: { [klass: string]: any; }) {
    this._videoStyle = { ...this._videoStyle, ...style };
  }

  // _hasTorchCapability: boolean;
  // _torch = false;

  _mediaStreamInfo: any;//MediaStreamInfo;
  private doUpdateMediaStreamInfo() {
    if (this._mediaStream) {
      this._mediaStreamInfo = MediaStreamHelper.getMediaStreamInfo(this._mediaStream);
    }
  }

  _mediaStream: MediaStream | undefined;
  set mediaStream(mediaStream: MediaStream | undefined) {
    this._mediaStream = mediaStream;
    this.doUpdateMediaStreamInfo()
  }

  constructor() { }

  ngOnInit(): void { }

  togglePublishAudio() {
    if (this._localStream) {
      if (this._localStream.getPublishOptions().audio) {
        MediaStreamHelper.disableAudio(this._localStream.getMediaStream())
      } else {
        MediaStreamHelper.enableAudio(this._localStream.getMediaStream())
      }
      this._localStream.updatePublishOptions({ audio: !this._localStream.getPublishOptions().audio })
        .then(() => { })
    }
  }

  togglePublishVideo() {
    if (this._localStream) {
      if (this._localStream.getPublishOptions().video) {
        MediaStreamHelper.disableVideo(this._localStream.getMediaStream())
      } else {
        MediaStreamHelper.enableVideo(this._localStream.getMediaStream())
      }
      this._localStream.updatePublishOptions({ video: !this._localStream.getPublishOptions().video })
        .then(() => { })
    }
  }

  toggleFlashlight() {
    // https://www.oberhofer.co/mediastreamtrack-and-its-capabilities/ 
    const l_torch = !this._mediaStreamInfo.video?.settings.torch;
    this._mediaStream?.getVideoTracks().forEach((track: MediaStreamTrack) => {
      track.applyConstraints({
        torch: l_torch,
        advanced: [{ torch: l_torch }]
      } as any)
        .then(() => {
          this.doUpdateMediaStreamInfo()
        })
        .catch(event => {
          if (globalThis.ephemeralVideoLogLevel.isWarnEnabled) {
            console.warn(`${CNAME}|toggleFlashlight error`, event)
          }
        });
    })
  }

  // toggleAudio() {
  //   if (this._mediaStream) {
  //     if (MediaStreamHelper.isAudioEnabled(this._mediaStream)) {
  //       MediaStreamHelper.disableAudio(this._mediaStream);
  //       this.audioEnabled = false;
  //     } else {
  //       MediaStreamHelper.enableAudio(this._mediaStream);
  //       this.audioEnabled = true;
  //     }
  //   }
  // }

  // toggleVideo() {
  //   if (this._mediaStream) {
  //     if (MediaStreamHelper.isVideoEnabled(this._mediaStream)) {
  //       MediaStreamHelper.disableVideo(this._mediaStream);
  //       this.videoEnabled = false;
  //     } else {
  //       MediaStreamHelper.enableVideo(this._mediaStream);
  //       this.videoEnabled = true;
  //     }
  //   }
  // }

}
