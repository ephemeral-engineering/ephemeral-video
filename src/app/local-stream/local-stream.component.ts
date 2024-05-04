import { NgStyle } from '@angular/common';
import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltip } from '@angular/material/tooltip';

import { LocalStream, PublishOptions } from 'ephemeral-webrtc';

import { MediaStreamHelper, MediaStreamInfo } from '../MediaStreamHelper';
import { ControlledStreamComponent } from '../controlled-stream/controlled-stream.component';

const CNAME = 'LocalStream';

@Component({
  selector: 'app-local-stream',
  templateUrl: './local-stream.component.html',
  styleUrls: ['./local-stream.component.css'],
  standalone: true,
  imports: [NgStyle, MatButtonModule, MatIconModule, MatTooltip, ControlledStreamComponent],
})
export class LocalStreamComponent implements OnInit {

  _publishOptions: PublishOptions = { audio: false, video: false };

  audioEnabled = false;
  videoEnabled = false;

  private doUpdateStates() {
    this.audioEnabled = this._mediaStream ? MediaStreamHelper.isAudioEnabled(this._mediaStream) : false;
    this.videoEnabled = this._mediaStream ? MediaStreamHelper.isVideoEnabled(this._mediaStream) : false;
  }

  _localStream: LocalStream;
  @Input({ required: true }) set localStream(localStream: LocalStream) {
    this._localStream = localStream;

    if (localStream) {
      this._publishOptions = localStream.getPublishOptions();
      if (globalThis.ephemeralVideoLogLevel.isDebugEnabled) {
        console.debug(`${CNAME}|set _localStream`, localStream.getPublishOptions())
      }

      localStream.onPublishOptionsUpdate(() => {
        if (globalThis.ephemeralVideoLogLevel.isDebugEnabled) {
          console.debug(`${CNAME}|onPublishOptionsUpdate`, localStream.getPublishOptions())
        }
        this._publishOptions = localStream.getPublishOptions();
        // Reflect the publish options to the stream track so that user knows
        // someone (can be him but in this case we have already enabled/disabled the track)
        // has changed the publish options.
        if (this._publishOptions.audio) {
          MediaStreamHelper.enableAudio(this._localStream.getMediaStream())
        } else {
          MediaStreamHelper.disableAudio(this._localStream.getMediaStream())
        }
        if (this._publishOptions.video) {
          MediaStreamHelper.enableVideo(this._localStream.getMediaStream())
        } else {
          MediaStreamHelper.disableVideo(this._localStream.getMediaStream())
        }
        this.doUpdateStates()
      })

      this.mediaStream = localStream.getMediaStream();
      localStream.onMediaStream((mediaStream) => {
        this.mediaStream = mediaStream;
      })
    }
  }

  _mediaStreamInfo: any; // should MediaStreamInfo, but use 'any' because some properties like 'torch' is not standardized and defined in MediaStreamInfo
  @Input() set mediaStreamInfo(info: MediaStreamInfo | undefined) {
    this._mediaStreamInfo = info;
  }

  _videoStyle: { [klass: string]: any; } = {};
  @Input() set videoStyle(style: { [klass: string]: any; }) {
    this._videoStyle = { ...this._videoStyle, ...style };
  }

  @Output() onToggleFlashlight = new EventEmitter<void>();

  _mediaStream: MediaStream | undefined;
  set mediaStream(mediaStream: MediaStream | undefined) {
    this._mediaStream = mediaStream;
    this.doUpdateStates()
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
      this.doUpdateStates()
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
    if (globalThis.ephemeralVideoLogLevel.isDebugEnabled) {
      console.debug(`${CNAME}|toggleFlashlight`)
    }
    this.onToggleFlashlight.emit()
  }

}
