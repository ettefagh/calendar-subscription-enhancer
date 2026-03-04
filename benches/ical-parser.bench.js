import { bench, describe } from "vitest";
import { ICalLineUnfolder, ICalLineEnhancer } from "../src/ical-parser.js";

// --- Test data --- //

const SIMPLE_EVENT = [
  "BEGIN:VCALENDAR",
  "VERSION:2.0",
  "PRODID:-//Test//Test//EN",
  "BEGIN:VEVENT",
  "DTSTART:20250115T090000Z",
  "DTEND:20250115T103000Z",
  "DTSTAMP:20250110T120000Z",
  "UID:event-001@test",
  "SUMMARY:\u{1F512} k_BCS_008 - Computer Security \u{1F4BB}",
  "LOCATION:CUBE 1.03 (Sonnenallee 221A\\, 12059 Berlin)",
  "DESCRIPTION:Some description text",
  "ATTENDEE;CN=Test Person:mailto:test@example.com",
  "ORGANIZER;CN=Prof Test:mailto:prof@example.com",
  "STATUS:CONFIRMED",
  "END:VEVENT",
  "END:VCALENDAR",
].join("\r\n");

const MULTI_EVENT = Array.from({ length: 20 }, (_, i) => {
  const buildings = ["CUBE", "A", "B", "C", "D"];
  const building = buildings[i % buildings.length];
  const room = building === "CUBE" ? `CUBE ${i + 1}.0${(i % 3) + 1}` : `${building}${i + 1}.0${(i % 3) + 1}`;
  return [
    "BEGIN:VEVENT",
    `DTSTART:2025011${(i % 9) + 1}T${String(8 + (i % 8)).padStart(2, "0")}0000Z`,
    `DTEND:2025011${(i % 9) + 1}T${String(10 + (i % 8)).padStart(2, "0")}0000Z`,
    `DTSTAMP:20250110T120000Z`,
    `UID:event-${String(i).padStart(3, "0")}@test`,
    `SUMMARY:\u{1F4DA} k_BCS_${String(i).padStart(3, "0")} - Course ${i} Subject Name`,
    `LOCATION:${room} (Sonnenallee 221A\\, 12059 Berlin)`,
    `DESCRIPTION:Course description for event ${i}`,
    `ATTENDEE;CN=Student ${i}:mailto:student${i}@example.com`,
    `STATUS:CONFIRMED`,
    "END:VEVENT",
  ].join("\r\n");
}).join("\r\n");

const LARGE_CALENDAR =
  "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Test//Test//EN\r\n" +
  MULTI_EVENT +
  "\r\nEND:VCALENDAR";

const FOLDED_LINES_INPUT = [
  "BEGIN:VCALENDAR",
  "VERSION:2.0",
  "BEGIN:VEVENT",
  "DTSTART:20250115T090000Z",
  "DTEND:20250115T103000Z",
  "DTSTAMP:20250110T120000Z",
  "UID:folded-001@test",
  "SUMMARY:k_BCS_001 - This is a very long summary that should exceed",
  " the seventy-five byte limit and therefore needs to be unfolded",
  " properly by the streaming parser before processing",
  "LOCATION:C3.05 (Sonnenallee 221D\\, 12059 Berlin)",
  "DESCRIPTION:A very long description field that spans multiple lines",
  " and includes various details about the course content and",
  " additional information for students attending the lecture",
  "STATUS:CONFIRMED",
  "END:VEVENT",
  "END:VCALENDAR",
].join("\r\n");

const ONLINE_EVENT = [
  "BEGIN:VCALENDAR",
  "VERSION:2.0",
  "BEGIN:VEVENT",
  "DTSTART:20250115T140000Z",
  "DTEND:20250115T153000Z",
  "DTSTAMP:20250110T120000Z",
  "UID:online-001@test",
  "SUMMARY:k_BCS_050 - Online Lecture",
  "LOCATION:Online",
  "DESCRIPTION:Online session",
  "STATUS:CONFIRMED",
  "END:VEVENT",
  "END:VCALENDAR",
].join("\r\n");

// --- Helper --- //

async function processCalendar(input) {
  const encoder = new TextEncoder();
  const unfolder = new ICalLineUnfolder();
  const enhancer = new ICalLineEnhancer();
  const results = [];
  const controller = {
    enqueue: (chunk) => results.push(new TextDecoder().decode(chunk)),
  };
  const inputBytes = encoder.encode(input);
  const chunkSize = 512;
  for (let i = 0; i < inputBytes.length; i += chunkSize) {
    const chunk = inputBytes.slice(i, i + chunkSize);
    await unfolder.processChunk(chunk, controller, enhancer);
  }
  unfolder.flush(controller, enhancer);
  return results.join("");
}

// --- Benchmarks --- //

describe("ICalLineEnhancer", () => {
  bench("enhance single event", () => {
    const enhancer = new ICalLineEnhancer();
    const lines = SIMPLE_EVENT.split("\r\n");
    const output = [];
    for (const line of lines) {
      output.push(...enhancer.processLine(line));
    }
  });

  bench("enhance 20 events", () => {
    const enhancer = new ICalLineEnhancer();
    const lines = LARGE_CALENDAR.split("\r\n");
    const output = [];
    for (const line of lines) {
      output.push(...enhancer.processLine(line));
    }
  });

  bench("enhance online event", () => {
    const enhancer = new ICalLineEnhancer();
    const lines = ONLINE_EVENT.split("\r\n");
    const output = [];
    for (const line of lines) {
      output.push(...enhancer.processLine(line));
    }
  });
});

describe("Streaming pipeline", () => {
  bench("process single event through stream", async () => {
    await processCalendar(SIMPLE_EVENT);
  });

  bench("process 20 events through stream", async () => {
    await processCalendar(LARGE_CALENDAR);
  });

  bench("process folded lines through stream", async () => {
    await processCalendar(FOLDED_LINES_INPUT);
  });

  bench("process small chunks (64 bytes)", async () => {
    const encoder = new TextEncoder();
    const unfolder = new ICalLineUnfolder();
    const enhancer = new ICalLineEnhancer();
    const results = [];
    const controller = {
      enqueue: (chunk) => results.push(new TextDecoder().decode(chunk)),
    };
    const inputBytes = encoder.encode(SIMPLE_EVENT);
    for (let i = 0; i < inputBytes.length; i += 64) {
      const chunk = inputBytes.slice(i, i + 64);
      await unfolder.processChunk(chunk, controller, enhancer);
    }
    unfolder.flush(controller, enhancer);
  });
});
