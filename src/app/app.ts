import { Component, inject, OnInit, DestroyRef, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { DatePipe, CommonModule } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { timer, switchMap, catchError, EMPTY } from 'rxjs';

// Angular Material Imports
import { MatTableModule } from '@angular/material/table';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';

import { KmbEtaResponse, KmbEtaItem } from './kmb-eta.model';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    DatePipe,
    MatTableModule,
    MatProgressSpinnerModule,
    MatCardModule,
    MatChipsModule,
    MatIconModule,
    MatButtonModule,
  ],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
})
export class App implements OnInit {
  private http = inject(HttpClient);
  private destroyRef = inject(DestroyRef);

  private apiUrl = 'https://data.etabus.gov.hk/v1/transport/kmb/stop-eta/D3E18D04B69DF388';
  private REFRESH_INTERVAL_MS = 30000; // 30 seconds

  displayedColumns: string[] = ['route', 'destination', 'eta', 'minutesLeft', 'remarks'];

  etaList = signal<KmbEtaItem[]>([]);
  loading = signal<boolean>(true);
  error = signal<string | null>(null);
  lastUpdated = signal<Date | null>(null);
  currentTime = signal<Date>(new Date());

  ngOnInit(): void {
    this.startPolling();
    // Live clock: updates every second
    timer(0, 1000)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.currentTime.set(new Date()));
  }

  startPolling(): void {
    this.loading.set(true);
    this.error.set(null);

    // timer(0, REFRESH_INTERVAL_MS) starts immediately (0ms delay) and emits every 60,000ms
    timer(0, this.REFRESH_INTERVAL_MS)
      .pipe(
        switchMap(() =>
          this.http.get<KmbEtaResponse>(this.apiUrl).pipe(
            catchError((err) => {
              this.error.set('Failed to load bus ETA data.');
              this.loading.set(false);
              console.error('Error fetching ETA:', err);
              return EMPTY;
            }),
          ),
        ),
        takeUntilDestroyed(this.destroyRef), // Automatically cancels timer when component is unmounted
      )
      .subscribe((response) => {
        const filtered = (response.data || [])
          .filter(
            (item) => (item.route === '70K' && item.service_type === 2) || item.route === '79K',
          )
          .sort((a, b) => {
            const aTime = a.eta ? new Date(a.eta).getTime() : Infinity;
            const bTime = b.eta ? new Date(b.eta).getTime() : Infinity;
            return aTime - bTime;
          });
        this.etaList.set(filtered);
        this.lastUpdated.set(new Date());
        this.loading.set(false);
      });
  }

  getTimeLeft(etaStr: string): string {
    if (!etaStr) return 'No schedule';

    const eta = new Date(etaStr).getTime();
    const now = this.currentTime() ? this.currentTime().getTime() : new Date().getTime();
    const diffMs = eta - now;

    if (diffMs <= 0) return '即將到站';

    const totalSeconds = Math.floor(diffMs / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const secStr = seconds.toString().padStart(2, '0');

    return `${minutes}分${secStr}秒`;
  }

  isArriving(etaStr: string): boolean {
    if (!etaStr) return false;
    const diffMins = (new Date(etaStr).getTime() - new Date().getTime()) / 60000;
    return diffMins <= 3;
  }
}
