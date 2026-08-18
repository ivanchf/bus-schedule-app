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
  template: `
    <mat-card class="eta-card">
      <mat-card-header>
        <mat-card-title class="header-title">
          <mat-icon color="warn">directions_bus</mat-icon>
          Anna's Bus
        </mat-card-title>
        <mat-card-subtitle class="header-subtitle">
          <span>巴士站: 天平邨天明樓</span>
          <span class="live-clock" *ngIf="currentTime()">
            • 現在時間: {{ currentTime() | date: 'h:mm:ss a' }}
          </span>
          <span class="refresh-indicator" *ngIf="lastUpdated()">
            • 最後更新: {{ lastUpdated() | date: 'h:mm:ss a' }} (每30秒自動刷新)
          </span>
        </mat-card-subtitle>
      </mat-card-header>

      <mat-card-content class="content-container">
        <!-- Initial Loading State -->
        <div *ngIf="loading()" class="center-state">
          <mat-spinner diameter="40"></mat-spinner>
          <p>Fetching arrival times...</p>
        </div>

        <!-- Error State -->
        <div *ngIf="error()" class="center-state error-text">
          <mat-icon color="warn">error</mat-icon>
          <p>{{ error() }}</p>
          <button mat-raised-button color="primary" (click)="startPolling()">Retry</button>
        </div>

        <!-- Mobile-friendly card list -->
        <div class="list-container" *ngIf="!loading() && !error()">
          <mat-card *ngFor="let item of etaList(); let i = index" class="eta-item mat-elevation-z2">
              <mat-card-header>
              <div mat-card-avatar class="route-avatar" [class.route-70k]="item.route === '70K'" [class.route-79k]="item.route === '79K'">{{ item.route }}</div>
              <mat-card-title>{{ item.dest_tc }}</mat-card-title>
              <mat-card-subtitle>{{ item.rmk_tc || '' }}</mat-card-subtitle>
            </mat-card-header>

            <div class="order-badge">{{ i + 1 }}</div>

            <mat-card-content>
              <div class="eta-item-row">
                <div class="eta-info">
                  <div class="eta-time">{{ item.eta ? (item.eta | date: 'h:mm a') : 'N/A' }}</div>
                  <mat-chip [highlighted]="isArriving(item.eta)" color="accent">{{ getMinutesLeft(item.eta) }}</mat-chip>
                </div>
              </div>
            </mat-card-content>
          </mat-card>

          <div *ngIf="etaList().length === 0" class="empty-row">No upcoming buses scheduled for this stop.</div>
        </div>
      </mat-card-content>
    </mat-card>
  `,
  styles: [
    `
      .eta-card { max-width: 1200px; margin: 24px auto; padding: 12px; }
      .header-title { display: flex; align-items: center; gap: 8px; font-size: 1.35rem; font-weight: 700; }
      .header-subtitle { display: flex; gap: 8px; flex-wrap: wrap; font-size: 0.95rem; }
      .refresh-indicator { color: #666; font-style: italic; }
      .live-clock { color: #666; font-style: italic; margin-left: 6px; }
      .content-container { margin-top: 16px; }

      /* Responsive grid: cards auto-fit into columns on larger screens */
      .list-container {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
        gap: 12px;
        align-items: start;
      }

      .eta-item { position: relative; padding: 10px; border-radius: 10px; background: #fff; height: 100%; display: flex; flex-direction: column; }
      .order-badge { position: absolute; top: 10px; right: 10px; background: rgba(0,0,0,0.08); color: #222; font-weight: 800; width: 34px; height: 34px; border-radius: 50%; display:flex; align-items:center; justify-content:center; font-size: 1rem; }
      /* Slightly larger badge on wider screens */
      @media (min-width: 900px) { .order-badge { width: 40px; height: 40px; font-size: 1.05rem; } }
      .eta-item mat-card-content { flex: 1 1 auto; }
      .eta-item-row { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
      .left { display: flex; align-items: center; gap: 12px; min-width: 0; }
      .destination { display: flex; flex-direction: column; min-width: 0; overflow: hidden; }
      .eta-info { display: flex; flex-direction: column; align-items: flex-end; gap: 8px; white-space: nowrap; }
      .eta-time { font-weight: 700; font-size: 1.15rem; }

      .route-badge {
        font-weight: 800;
        color: #e60012;
        font-size: 1.2rem;
        padding: 8px 10px;
        border-radius: 8px;
        display: inline-block;
        min-width: 56px;
        text-align: center;
      }

      .route-avatar {
        font-weight: 800;
        color: #fff;
        background: #e60012;
        width: 56px;
        height: 56px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1.05rem;
      }

      /* Highlight styles for specific routes */
      .route-70k { background: #fff3e0; color: #bf360c; box-shadow: inset 0 -2px 0 rgba(0,0,0,0.06); }
      .route-79k { background: #e3f2fd; color: #0d47a1; box-shadow: inset 0 -2px 0 rgba(0,0,0,0.04); }

      .mat-card-title, .destination strong { font-size: 1.05rem; font-weight: 700; }
      .sub-text { color: #666; font-size: 0.95rem; margin-left: 4px; overflow: hidden; text-overflow: ellipsis; }
      .center-state { display: flex; flex-direction: column; align-items: center; padding: 32px 0; gap: 12px; }
      .error-text { color: #d32f2f; }
      .empty-row { text-align: center; padding: 24px; color: #666; }

      /* Responsive: stack content on narrow screens */
      @media (max-width: 600px) {
        .eta-card { margin: 12px; padding: 8px; }
        .eta-item-row { flex-direction: column; align-items: flex-start; gap: 8px; }
        .eta-info { align-self: stretch; flex-direction: row; justify-content: space-between; width: 100%; }
        .route-badge { font-size: 1.05rem; padding: 6px 8px; min-width: 48px; }
        .route-avatar { width: 48px; height: 48px; font-size: 0.95rem; }
        .eta-time { font-size: 1.05rem; }
        .mat-card-title { font-size: 1.05rem; }
      }
    `,
  ],
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

  getMinutesLeft(etaStr: string): string {
    if (!etaStr) return 'No schedule';

    const eta = new Date(etaStr).getTime();
    const now = new Date().getTime();
    const diffMins = Math.round((eta - now) / 60000);

    if (diffMins <= 0) return 'Arriving';
    return `${diffMins} 分鐘`;
  }

  isArriving(etaStr: string): boolean {
    if (!etaStr) return false;
    const diffMins = (new Date(etaStr).getTime() - new Date().getTime()) / 60000;
    return diffMins <= 3;
  }
}
