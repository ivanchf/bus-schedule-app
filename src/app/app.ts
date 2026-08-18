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
          KMB Bus Arrival Estimates
        </mat-card-title>
        <mat-card-subtitle class="header-subtitle">
          <span>Stop ID: D3E18D04B69DF388</span>
          <span class="refresh-indicator" *ngIf="lastUpdated()">
            • Last updated: {{ lastUpdated() | date: 'HH:mm:ss' }} (Auto-refreshes every 1m)
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

        <!-- Material Table -->
        <div class="table-container" *ngIf="!loading() && !error()">
          <table mat-table [dataSource]="etaList()" class="mat-elevation-z2">
            <!-- Route Column -->
            <ng-container matColumnDef="route">
              <th mat-header-cell *matHeaderCellDef>Route</th>
              <td mat-cell *matCellDef="let item">
                <span class="route-badge">{{ item.route }}</span>
              </td>
            </ng-container>

            <!-- Destination Column -->
            <ng-container matColumnDef="destination">
              <th mat-header-cell *matHeaderCellDef>Destination</th>
              <td mat-cell *matCellDef="let item">
                <strong>{{ item.dest_en }}</strong>
                <span class="sub-text">({{ item.dest_tc }})</span>
              </td>
            </ng-container>

            <!-- ETA Time Column -->
            <ng-container matColumnDef="eta">
              <th mat-header-cell *matHeaderCellDef>Scheduled ETA</th>
              <td mat-cell *matCellDef="let item">
                {{ item.eta ? (item.eta | date: 'HH:mm:ss') : 'N/A' }}
              </td>
            </ng-container>

            <!-- Minutes Away Column -->
            <ng-container matColumnDef="minutesLeft">
              <th mat-header-cell *matHeaderCellDef>Status / Arrival</th>
              <td mat-cell *matCellDef="let item">
                <mat-chip [highlighted]="isArriving(item.eta)" color="accent">
                  {{ getMinutesLeft(item.eta) }}
                </mat-chip>
              </td>
            </ng-container>

            <!-- Remarks Column -->
            <ng-container matColumnDef="remarks">
              <th mat-header-cell *matHeaderCellDef>Remarks</th>
              <td mat-cell *matCellDef="let item">
                {{ item.rmk_en || '-' }}
              </td>
            </ng-container>

            <tr mat-header-row *matHeaderRowDef="displayedColumns"></tr>
            <tr mat-row *matRowDef="let row; columns: displayedColumns"></tr>

            <tr class="mat-row" *matNoDataRow>
              <td class="mat-cell empty-row" [attr.colspan]="displayedColumns.length">
                No upcoming buses scheduled for this stop.
              </td>
            </tr>
          </table>
        </div>
      </mat-card-content>
    </mat-card>
  `,
  styles: [
    `
      .eta-card {
        max-width: 900px;
        margin: 24px auto;
        padding: 12px;
      }
      .header-title {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .header-subtitle {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
      }
      .refresh-indicator {
        color: #666;
        font-style: italic;
      }
      .content-container {
        margin-top: 16px;
      }
      .table-container {
        overflow-x: auto;
      }
      table {
        width: 100%;
      }
      .route-badge {
        font-weight: 700;
        color: #e60012;
        font-size: 1.1rem;
      }
      .sub-text {
        color: #666;
        font-size: 0.85rem;
        margin-left: 4px;
      }
      .center-state {
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: 32px 0;
        gap: 12px;
      }
      .error-text {
        color: #d32f2f;
      }
      .empty-row {
        text-align: center;
        padding: 24px;
        color: #666;
      }
    `,
  ],
})
export class App implements OnInit {
  private http = inject(HttpClient);
  private destroyRef = inject(DestroyRef);

  private apiUrl = 'https://data.etabus.gov.hk/v1/transport/kmb/stop-eta/D3E18D04B69DF388';
  private REFRESH_INTERVAL_MS = 60000; // 1 minute

  displayedColumns: string[] = ['route', 'destination', 'eta', 'minutesLeft', 'remarks'];

  etaList = signal<KmbEtaItem[]>([]);
  loading = signal<boolean>(true);
  error = signal<string | null>(null);
  lastUpdated = signal<Date | null>(null);

  ngOnInit(): void {
    this.startPolling();
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
        this.etaList.set(response.data);
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
    return `${diffMins} mins`;
  }

  isArriving(etaStr: string): boolean {
    if (!etaStr) return false;
    const diffMins = (new Date(etaStr).getTime() - new Date().getTime()) / 60000;
    return diffMins <= 3;
  }
}
