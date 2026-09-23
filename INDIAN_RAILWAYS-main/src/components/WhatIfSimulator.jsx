import React, { useState } from 'react';

export default function WhatIfSimulator() {
  const [durationShift, setDurationShift] = useState(0);
  const [crewCapacity, setCrewCapacity] = useState(3);
  const [freightFactor, setFreightFactor] = useState(1.0);

  // Compute dynamic KPI projections
  const projectedAvailability = (97.8 - (durationShift * 0.4) - (freightFactor - 1.0) * 2.0).toFixed(1);
  const projectedDelays = Math.max(10, Math.round(38.5 + (durationShift * 12) + (freightFactor - 1.0) * 45));
  const projectedPossessions = Math.max(10, Math.round(15 - (crewCapacity - 3) * 2));

  return (
    <div className="bg-surface-container-lowest p-gutter-lg rounded-xl shadow-sm border border-outline-variant/30">
      <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-outline-variant/40 pb-gutter-md mb-gutter-md">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-headline-sm text-headline-sm font-bold text-primary">What-If Schedule Simulator</h2>
            <span className="bg-secondary text-on-secondary font-label-sm text-label-sm px-2.5 py-0.5 rounded font-bold uppercase">
              Real-Time Impact Sandbox
            </span>
          </div>
          <p className="font-body-sm text-body-sm text-on-surface-variant">
            Adjust block parameters, crew limits, or freight traffic density to instantly preview real-time KPI impacts before committing changes
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-gutter-md mb-gutter-lg">
        {/* Slider 1: Block Duration Shift */}
        <div className="bg-surface-container-low p-4 rounded-xl border border-outline-variant/30">
          <label className="font-label-sm text-label-sm font-bold text-primary uppercase block mb-2">
            Block Duration Adjustment (+/- Hours): {durationShift > 0 ? `+${durationShift}` : durationShift}h
          </label>
          <input
            type="range"
            min="-2"
            max="4"
            value={durationShift}
            onChange={(e) => setDurationShift(parseFloat(e.target.value))}
            className="w-full accent-primary"
          />
        </div>

        {/* Slider 2: Daily Crew Capacity */}
        <div className="bg-surface-container-low p-4 rounded-xl border border-outline-variant/30">
          <label className="font-label-sm text-label-sm font-bold text-primary uppercase block mb-2">
            Department Crew Limit: {crewCapacity} Gangs / Day
          </label>
          <input
            type="range"
            min="1"
            max="6"
            value={crewCapacity}
            onChange={(e) => setCrewCapacity(parseInt(e.target.value))}
            className="w-full accent-primary"
          />
        </div>

        {/* Slider 3: Freight Surge Factor */}
        <div className="bg-surface-container-low p-4 rounded-xl border border-outline-variant/30">
          <label className="font-label-sm text-label-sm font-bold text-primary uppercase block mb-2">
            Freight Traffic Factor: {(freightFactor * 100).toFixed(0)}%
          </label>
          <input
            type="range"
            min="0.8"
            max="2.0"
            step="0.1"
            value={freightFactor}
            onChange={(e) => setFreightFactor(parseFloat(e.target.value))}
            className="w-full accent-primary"
          />
        </div>
      </div>

      {/* Projected KPIs */}
      <div className="bg-primary p-4 rounded-xl text-on-primary flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <span className="font-bold text-secondary-fixed text-label-md uppercase block">Projected What-If System Impact</span>
          <span className="text-body-sm text-on-primary-container">Real-time optimization score recalculation</span>
        </div>

        <div className="grid grid-cols-3 gap-4 text-center font-mono">
          <div className="bg-primary-container/40 p-2 rounded">
            <span className="text-xs text-on-primary-container block">Availability</span>
            <span className="font-bold text-lg text-on-primary">{projectedAvailability}%</span>
          </div>
          <div className="bg-primary-container/40 p-2 rounded">
            <span className="text-xs text-on-primary-container block">Est. Delay</span>
            <span className="font-bold text-lg text-secondary-fixed">{projectedDelays}m</span>
          </div>
          <div className="bg-primary-container/40 p-2 rounded">
            <span className="text-xs text-on-primary-container block">Possessions</span>
            <span className="font-bold text-lg text-on-tertiary-container">{projectedPossessions}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
