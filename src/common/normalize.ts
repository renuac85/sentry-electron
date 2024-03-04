import { Envelope, Event, Profile, ReplayEvent } from '@sentry/types';
import { addItemToEnvelope, createEnvelope, forEachEnvelopeItem, normalizeUrlToBase } from '@sentry/utils';

/**
 * Normalizes all URLs in an event. See {@link normalizeUrl} for more
 * information. Mutates the passed in event.
 *
 * @param event The event to normalize.
 */
export function normalizeEvent(event: Event, basePath: string): Event {
  // Retrieve stack traces and normalize their paths. Without this, grouping
  // would not work due to usernames in file paths.
  for (const exception of event.exception?.values || []) {
    for (const frame of exception.stacktrace?.frames || []) {
      if (frame.filename) {
        frame.filename = normalizeUrlToBase(frame.filename, basePath);
      }
    }
  }

  // We need to normalize debug ID images the same way as the stack frames for symbolicator to match them correctly
  for (const debugImage of event.debug_meta?.images || []) {
    if (debugImage.type === 'sourcemap') {
      debugImage.code_file = normalizeUrlToBase(debugImage.code_file, basePath);
    }
  }

  if (event.transaction) {
    event.transaction = normalizeUrlToBase(event.transaction, basePath);
  }

  const { request = {} } = event;
  if (request.url) {
    request.url = normalizeUrlToBase(request.url, basePath);
  }

  if (event.contexts?.feedback?.url && typeof event.contexts.feedback.url === 'string') {
    event.contexts.feedback.url = normalizeUrlToBase(event.contexts.feedback.url, basePath);
  }

  event.contexts = {
    ...event.contexts,
    runtime: {
      name: 'Electron',
      version: process.versions.electron,
    },
  };

  // The user agent is parsed by Sentry and would overwrite certain context
  // information, which we don't want. Generally remove it, since we know that
  // we are browsing with Chrome.
  if (request.headers) {
    delete request.headers['User-Agent'];
  }

  // The Node SDK includes server_name, which contains the machine name of the computer running Electron.
  // In this case this is likely to include PII.
  const { tags = {} } = event;
  delete tags.server_name;
  delete event.server_name;
  return event;
}

/** Normalizes URLs in any replay_event items found in an envelope */
export function normalizeUrlsInReplayEnvelope(envelope: Envelope, basePath: string): Envelope {
  let modifiedEnvelope = createEnvelope(envelope[0]);

  let isReplay = false;

  forEachEnvelopeItem(envelope, (item, type) => {
    if (type === 'replay_event') {
      isReplay = true;
      const [headers, event] = item as [{ type: 'replay_event' }, ReplayEvent];

      if (Array.isArray(event.urls)) {
        event.urls = event.urls.map((url) => normalizeUrlToBase(url, basePath));
      }

      if (event?.request?.url) {
        event.request.url = normalizeUrlToBase(event.request.url, basePath);
      }

      modifiedEnvelope = addItemToEnvelope(modifiedEnvelope, [headers, event]);
    } else if (type === 'replay_recording') {
      modifiedEnvelope = addItemToEnvelope(modifiedEnvelope, item);
    }
  });

  return isReplay ? modifiedEnvelope : envelope;
}

/**
 * Normalizes all URLs in a profile
 */
export function normaliseProfile(profile: Profile, basePath: string): void {
  for (const frame of profile.profile.frames) {
    if (frame.abs_path) {
      frame.abs_path = normalizeUrlToBase(frame.abs_path, basePath);
    }
  }
}
