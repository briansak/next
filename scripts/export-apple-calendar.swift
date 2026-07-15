#!/usr/bin/env swift
import EventKit
import Foundation

struct ExportEvent: Encodable {
  let calendar: String
  let uid: String
  let summary: String
  let start: String
  let end: String?
  let location: String?
  let description: String?
  let organizerEmail: String?
  let organizerName: String?
  let attendeeEmails: [String]
  let isRecurring: Bool
  let isAllDay: Bool
}

struct ExportResult: Encodable {
  var calendars: [String]
  var events: [ExportEvent]
  var warnings: [String]
}

let iso = ISO8601DateFormatter()
iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]

func isoString(_ date: Date) -> String {
  iso.string(from: date)
}

let lookbackDays = Int(ProcessInfo.processInfo.environment["APPLE_CALENDAR_LOOKBACK_DAYS"] ?? "14") ?? 14
let lookaheadDays = Int(ProcessInfo.processInfo.environment["APPLE_CALENDAR_LOOKAHEAD_DAYS"] ?? "30") ?? 30
let maxEvents = Int(ProcessInfo.processInfo.environment["APPLE_CALENDAR_MAX_EVENTS"] ?? "500") ?? 500
let includeNames = (ProcessInfo.processInfo.environment["APPLE_CALENDAR_NAMES"] ?? "")
  .split(separator: ",")
  .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
  .filter { !$0.isEmpty }

let skipCalendars: Set<String> = [
  "Birthdays",
  "US Holidays",
  "United States holidays",
  "Siri Suggestions",
  "Scheduled Reminders",
]

let store = EKEventStore()
let semaphore = DispatchSemaphore(value: 0)
var output = ExportResult(calendars: [], events: [], warnings: [])

func requestAccess(_ completion: @escaping (Bool, String?) -> Void) {
  if #available(macOS 14.0, *) {
    store.requestFullAccessToEvents { granted, error in
      if let error {
        completion(false, error.localizedDescription)
        return
      }
      completion(granted, granted ? nil : "Calendar access denied")
    }
    return
  }

  store.requestAccess(to: .event) { granted, error in
    if let error {
      completion(false, error.localizedDescription)
      return
    }
    completion(granted, granted ? nil : "Calendar access denied")
  }
}

requestAccess { granted, errorMessage in
  defer { semaphore.signal() }

  guard granted else {
    let message = errorMessage ?? "Calendar access denied"
    fputs(
      "{\"error\":\"\(message). Grant Calendars access to your terminal or IDE in System Settings → Privacy & Security → Calendars.\"}\n",
      stderr
    )
    exit(2)
  }

  let start = Calendar.current.date(byAdding: .day, value: -lookbackDays, to: Date()) ?? Date()
  let end = Calendar.current.date(byAdding: .day, value: lookaheadDays, to: Date()) ?? Date()

  var calendars = store.calendars(for: .event)
  if !includeNames.isEmpty {
    let wanted = Set(includeNames)
    calendars = calendars.filter { wanted.contains($0.title) }
  } else {
    calendars = calendars.filter { !skipCalendars.contains($0.title) }
  }

  if calendars.isEmpty {
    output.warnings.append("No calendars matched. Set APPLE_CALENDAR_NAMES to a comma-separated list from Calendar.app.")
    let encoded = try! JSONEncoder().encode(output)
    print(String(data: encoded, encoding: .utf8)!)
    return
  }

  output.calendars = calendars.map(\.title)
  let predicate = store.predicateForEvents(withStart: start, end: end, calendars: calendars)
  let fetched = store.events(matching: predicate).sorted { $0.startDate < $1.startDate }

  if fetched.count > maxEvents {
    output.warnings.append("Found \(fetched.count) events; exporting first \(maxEvents). Narrow APPLE_CALENDAR_NAMES or date window if needed.")
  }

  for event in fetched.prefix(maxEvents) {
    let organizerEmail = event.organizer?.url
      .absoluteString
      .replacingOccurrences(of: "mailto:", with: "", options: .caseInsensitive)
      .lowercased()

    let attendees = event.attendees?
      .compactMap { $0.url.absoluteString.replacingOccurrences(of: "mailto:", with: "", options: .caseInsensitive).lowercased() }
      ?? []

    output.events.append(
      ExportEvent(
        calendar: event.calendar.title,
        uid: event.calendarItemIdentifier,
        summary: event.title ?? "(no title)",
        start: isoString(event.startDate),
        end: event.isAllDay ? nil : isoString(event.endDate),
        location: event.location,
        description: event.notes.map { String($0.prefix(4000)) },
        organizerEmail: organizerEmail?.isEmpty == true ? nil : organizerEmail,
        organizerName: event.organizer?.name,
        attendeeEmails: Array(Set(attendees)),
        isRecurring: event.hasRecurrenceRules,
        isAllDay: event.isAllDay
      )
    )
  }

  let encoded = try! JSONEncoder().encode(output)
  print(String(data: encoded, encoding: .utf8)!)
}

semaphore.wait()
