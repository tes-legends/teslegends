import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, forkJoin, Observable, of } from 'rxjs';
import { map } from 'rxjs/operators';

interface AudioManifest {
  files: string[];
  cardToFiles: Record<string, string[]>;
}

@Injectable({ providedIn: 'root' })
export class AudioService {
  //private manifest: AudioManifest | null = null;
  private manifests: Record<string, AudioManifest> = {};
  private audioQueue: string[] = [];
  private isPlaying = false;

  private setPaths: Record<string, string> = {
    'Core Set': '/assets/tesl/audio/core_set/',
    'Dark Brotherhood': '/assets/tesl/audio/brotherhood/',
    'Heroes of Skyrim': '/assets/tesl/audio/heroes_of_skyrim/',
    'Custom Set': '/assets/tesl/audio/custom_set/',
    'Madhouse Collection': '/assets/tesl/audio/madhouse/',
    'Monthly Reward': '/assets/tesl/audio/reward_set/',
    'Story Set': '/assets/tesl/audio/story_set/'
  };

  //private basePath = '/assets/tesl/audio/core_set/';

  constructor(private http: HttpClient) {}

  /*loadAllManifest(): Observable<boolean> {
    this.loadManifest('Core Set').subscribe();
    this.loadManifest('Heroes of Skyrim').subscribe();
    if (this.manifest) return new BehaviorSubject(true);

    return this.http.get<AudioManifest>(`${this.basePath}audio-manifest.json`).pipe(
      map(data => {
        this.manifest = data;
        console.log(`Loaded ${data.files.length} audio files`);
        return true;
      })
    );
  }*/

  /*loadManifest(set: string): Observable<boolean> {
    if (this.manifests[set]) {
      return new BehaviorSubject(true);
    }

    const basePath = this.setPaths[set];
    if (!basePath) {
      console.warn(`Unknown set: ${set}`);
      return new BehaviorSubject(false);
    }

    return this.http.get<AudioManifest>(`${basePath}audio-manifest.json`).pipe(
      map(data => {
        this.manifests[set] = data;
        console.log(`Loaded ${data.files.length} audio files for ${set}`);
        return true;
      })
    );
  }*/

  loadManifest(): Observable<boolean> {

    const requests = Object.entries(this.setPaths).map(([set, path]) => {

      if (this.manifests[set]) {
        return of(true);
      }

      return this.http.get<AudioManifest>(`${path}audio-manifest.json`).pipe(
        map(data => {
          this.manifests[set] = data;
          console.log(`Loaded ${data.files.length} audio files for ${set}`);
          return true;
        })
      );

    });

    return forkJoin(requests).pipe(
      map(() => true)
    );
  }

  getAudioForCard(cardName: string, type: string, set: string): string | null {
    //type 'stage' | 'enter' | 'attack' | 'lastgasp' | 'hit'
    const manifest = this.manifests[set];
    const basePath = this.setPaths[set];

    if (!manifest || !basePath) return null;
    if (!manifest.cardToFiles[cardName]) return null;

    const candidates = manifest.cardToFiles[cardName];
    if (candidates.length === 0) return null;
    if (type === 'stage') {
        const chosen = candidates[Math.floor(Math.random() * candidates.length)];
        return `${basePath}${chosen}`;
    }
    let pattern: RegExp;

    switch (type) {
        case 'enter':
        pattern = /_enter_play/i;
        break;
        case 'attack':
        pattern = /_attack/i;
        break;
        case 'lastgasp':
        pattern = /_last_gasp/i;
        break;
        case 'beastform':
        pattern = /_beastform/i;
        break;
        case 'trigger':
        pattern = /_trigger/i;
        break;
        case 'hit':
        pattern = /_hit/i;
        break;
        default:
        // Safety fallback — should never reach here
        pattern = /.*/; // match anything
    }

    const matching = candidates.filter(f => pattern.test(f));

    if (matching.length === 0) {
        // Fallback: use any file (or you could return null / log warning)
        //console.warn(`No ${type} audio found for ${cardName}, using random fallback`);
        return null;
    }

    // Pick one randomly from matching files
    const chosen = matching[Math.floor(Math.random() * matching.length)];
    console.log(`playing audio ${type} for ${cardName}`);
    return `${basePath}${chosen}`;
    
  }

  // ─── Queue system ───────────────────────────────────────
  queueAudio(url: string | null): void {
    if (!url) return;
    this.audioQueue.push(url);
    this.playNext();
  }

    stopAllAudio(): void {
        // Clear queued sounds
        this.audioQueue = [];
    }

  private playNext(): void {
    if (this.isPlaying || this.audioQueue.length === 0) return;

    const url = this.audioQueue.shift()!;
    const audio = new Audio(url);

    audio.onended = () => {
      this.isPlaying = false;
      this.playNext();
    };

    audio.onerror = (e) => {
      console.warn('Audio failed:', url, e);
      this.isPlaying = false;
      this.playNext();
    };

    this.isPlaying = true;
    audio.play().catch(err => {
      console.warn('Play blocked:', err);
      this.isPlaying = false;
      this.playNext();
    });
  }
}