import { writeFile } from "fs/promises";
import Assignment, { convertUTCToLocal, generateCallBackURL } from "./utils";
import * as exec from "async-exec";

const ical = require("node-ical");

const destinationURL = process.argv[2];
let url;

if (!destinationURL) {
  console.log("No URL Provided\nUsage: ./Canvas2Things <url>\n");
  process.exit(1);
}

// Assure it's a valid url
try {
  url = new URL(destinationURL);
} catch (e) {
  console.log("Invalid URL Provided");
  process.exit(1);
}

(async () => {
  console.log("Fetching calendar...");
  let cal = await ical.async.fromURL(url.href);
  const classMap: Map<string, Map<string, Assignment>> = new Map();

  // Loop through all events and extract the assignment
  console.log("Parsing calendar...");
  // TODO: add cool loading animation
  for (let k in cal) {
    if (!k.startsWith("event")) continue;
    let event = cal[k];

    // Get class name form patter of "Assignment Name [Class Name]"
    const className = event.summary.match(/\[(.*)\]/)[1];

    // Create the assignment to be added
    const assignmentTBA = new Assignment(
      event.uid.split("-").pop(),
      event.summary.replace(`[${className}]`, "").trim(),
      event.datetype === "date" ? false : true,
      // Convert date to local time using the timezone env variable
      convertUTCToLocal(event.start),
      event.description ? event.description.toLowerCase().includes("zoom") : "",
      event.url,
      event.description
    );

    if (!classMap.has(className)) classMap.set(className, new Map());
    const targetClass = classMap.get(className);

    // Create the assignment (or replace it if it already exists)
    if (targetClass.has(assignmentTBA.uid) && !k.includes("override")) continue;
    targetClass.set(assignmentTBA.uid, assignmentTBA);
  }

  // All classes and assignments are now in the classMap
  // Now we need to convert them to tasks
  console.log("Converting to tasks...");
  let tasks = [];
  for (let [className, assignments] of classMap) {
    // Create the project
    let finalProject = {
      type: "project",
      attributes: {
        title: className,
        items: [],
      },
    };

    // Add the project to the tasks
    for (let assignment of assignments.values()) {
      finalProject.attributes.items.push(assignment.toTask());
    }

    // Add the project to the tasks
    tasks.push(finalProject);
  }

  console.log("Writing to file temp...");
  let callURL = generateCallBackURL("things", "json", { data: tasks });

  writeFile("/Users/jcasas/Library/Caches/dev.pns/url.txt", callURL);

  console.log("Executing shortcut...");
  // @ts-ignore
  exec.default(
    `shortcuts run "Things 3 API Stealth Mode" -i /Users/jcasas/Library/Caches/dev.pns/url.txt ; echo "Done"`
  );

  console.log(
    "Done! \nIf you don't see your tasks in things make sure you \ninstalled the shortcut and enabled the URL scheme."
  );
})();
