'use client';

import type { ToolUIPart } from 'ai';
import type { ReactNode } from 'react';

import { ResultSkeleton } from '@/components/ui/result-skeleton';
import type { WayfareMessagePart } from '@/features/agent/messages';
import { TOOL_NAMES } from '@/features/agent/tool-names';

import { ActivityCard } from './cards/activity-card';
import { AsideNote, Band } from './cards/band';
import { activitiesTitle, BAND_TITLE } from './cards/band-titles';
import { CostCard } from './cards/cost-card';
import { DestinationCard } from './cards/destination-card';
import { FlightCard } from './cards/flight-card';
import { HotelCard } from './cards/hotel-card';
import { ResultGrid } from './cards/result-grid';
import { WeatherCard, WeatherUnavailable } from './cards/weather-card';

/** Matches the grid a real result set fills, so the layout does not jump. */
const SKELETON_COUNT = 3;

/** Destinations are shown two across, so the waiting state should be too. */
const DESTINATION_SKELETON_COUNT = 2;

/** The part types the model's tool calls arrive as, derived from the tool names. */
const ToolPart = {
  DESTINATIONS: `tool-${TOOL_NAMES.RECOMMEND_DESTINATIONS}`,
  WEATHER: `tool-${TOOL_NAMES.GET_WEATHER}`,
  HOTELS: `tool-${TOOL_NAMES.SEARCH_HOTELS}`,
  ACTIVITIES: `tool-${TOOL_NAMES.SEARCH_ACTIVITIES}`,
  FLIGHTS: `tool-${TOOL_NAMES.SEARCH_FLIGHTS}`,
  COSTS: `tool-${TOOL_NAMES.ESTIMATE_COSTS}`,
} as const;

type SearchFailedProps = {
  /** What could not be loaded, as it reads mid-sentence: "places to stay". */
  what: string;
};

function SearchFailed({ what }: SearchFailedProps) {
  return (
    <AsideNote>
      Couldn&apos;t load {what} just now. The rest of the plan below is unaffected.
    </AsideNote>
  );
}

type SearchToolViewProps<TOutput> = {
  state: ToolUIPart['state'];
  /** Named in the waiting copy while the model is still filling in the call. */
  destination: string | undefined;
  output: TOutput | undefined;
  /** Waiting copy, with and without a destination to name. */
  pendingLabel: (destination: string | undefined) => string;
  /** Heading for the band, which some tools derive from what came back. */
  resultsTitle: (output: TOutput) => string;
  failureLabel: string;
  renderResults: (output: TOutput) => ReactNode;
  /** Defaults to the three-across grid stays and activities use. */
  columns?: 2 | 3;
  skeletonCount?: number;
};

/**
 * One search tool, at whatever stage it has reached.
 *
 * The two searches had a switch each over the same four states, differing only in
 * their copy and which plate they render — so the states are handled once here and
 * each tool supplies the differences. What is left in `ToolResult` is the part of
 * the job TypeScript actually needs a branch for: narrowing the part union so the
 * output is typed.
 */
function SearchToolView<TOutput>({
  state,
  destination,
  output,
  pendingLabel,
  resultsTitle,
  failureLabel,
  renderResults,
  columns,
  skeletonCount = SKELETON_COUNT,
}: SearchToolViewProps<TOutput>) {
  switch (state) {
    case 'input-streaming':
    case 'input-available':
      return <ResultSkeleton count={skeletonCount} label={pendingLabel(destination)} />;

    case 'output-available':
      if (!output) return null;
      return (
        <ResultGrid title={resultsTitle(output)} columns={columns}>
          {renderResults(output)}
        </ResultGrid>
      );

    case 'output-error':
      return <SearchFailed what={failureLabel} />;

    default:
      return null;
  }
}

type ToolResultProps = {
  part: WayfareMessagePart;
};

/**
 * Renders a tool call at whatever stage it is in. Because the plates read the
 * tool's typed output directly, there is no JSON parsing step that could fail
 * and no way for malformed model text to reach the UI.
 */
export function ToolResult({ part }: ToolResultProps) {
  if (part.type === ToolPart.DESTINATIONS) {
    return (
      <SearchToolView
        state={part.state}
        // The recommender is asked for a region and a climate, not a place, so
        // there is no destination to name while it works.
        destination={undefined}
        output={part.state === 'output-available' ? part.output : undefined}
        pendingLabel={() => 'Finding places that fit'}
        resultsTitle={() => BAND_TITLE.DESTINATIONS}
        failureLabel="destination ideas"
        columns={2}
        skeletonCount={DESTINATION_SKELETON_COUNT}
        renderResults={(output) =>
          output.destinations.map((destination, index) => (
            <DestinationCard key={destination.id} destination={destination} index={index} />
          ))
        }
      />
    );
  }

  // Handled outside `SearchToolView`: that abstraction is a band of competing
  // results, and a climate is one thing with no grid.
  if (part.type === ToolPart.WEATHER) {
    switch (part.state) {
      case 'input-streaming':
      case 'input-available':
        return (
          <ResultSkeleton
            count={1}
            label={part.input?.place ? `Checking ${part.input.place}` : 'Checking the weather'}
          />
        );

      case 'output-available':
        if (!part.output) return null;
        return (
          <Band title={BAND_TITLE.WEATHER}>
            {part.output.climate ? (
              <WeatherCard report={part.output.climate} />
            ) : (
              <WeatherUnavailable place={part.output.place} />
            )}
          </Band>
        );

      case 'output-error':
        return <SearchFailed what="the weather" />;

      default:
        return null;
    }
  }

  // Its own branch rather than the shared grid: fares are a ranked list with one
  // shared verdict underneath, which is a different shape from a grid of plates.
  if (part.type === ToolPart.FLIGHTS) {
    switch (part.state) {
      case 'input-streaming':
      case 'input-available':
        return <ResultSkeleton count={1} label="Checking fares" />;

      case 'output-available':
        return part.output ? (
          <Band title={BAND_TITLE.FLIGHTS}>
            <FlightCard
              fares={part.output.fares}
              insight={part.output.insight}
              origin={part.output.origin}
              destination={part.output.destination}
              travelers={part.input?.travelers ?? 1}
              departDate={part.input?.departDate}
              returnDate={part.input?.returnDate}
            />
          </Band>
        ) : null;

      case 'output-error':
        return <SearchFailed what="flight fares" />;

      default:
        return null;
    }
  }

  // Also outside `SearchToolView`: a total is one figure, not a band of options.
  if (part.type === ToolPart.COSTS) {
    switch (part.state) {
      case 'input-streaming':
      case 'input-available':
        return <ResultSkeleton count={1} label="Adding it up" />;

      case 'output-available':
        return part.output ? (
          <Band title={BAND_TITLE.COSTS}>
            <CostCard estimate={part.output} />
          </Band>
        ) : null;

      case 'output-error':
        return <SearchFailed what="the costs" />;

      default:
        return null;
    }
  }

  if (part.type === ToolPart.HOTELS) {
    return (
      <SearchToolView
        state={part.state}
        destination={part.input?.destination}
        output={part.state === 'output-available' ? part.output : undefined}
        pendingLabel={(destination) =>
          destination ? `Finding stays in ${destination}` : 'Finding places to stay'
        }
        resultsTitle={() => BAND_TITLE.HOTELS}
        failureLabel="places to stay"
        renderResults={(output) =>
          output.hotels.map((hotel, index) => (
            <HotelCard key={hotel.id} hotel={hotel} index={index} />
          ))
        }
      />
    );
  }

  if (part.type === ToolPart.ACTIVITIES) {
    return (
      <SearchToolView
        state={part.state}
        destination={part.input?.destination}
        output={part.state === 'output-available' ? part.output : undefined}
        pendingLabel={(destination) =>
          destination ? `Looking for things to do in ${destination}` : 'Looking for things to do'
        }
        resultsTitle={(output) => activitiesTitle(output.category)}
        failureLabel="things to do"
        renderResults={(output) =>
          output.activities.map((activity, index) => (
            <ActivityCard key={activity.id} activity={activity} index={index} />
          ))
        }
      />
    );
  }

  return null;
}
