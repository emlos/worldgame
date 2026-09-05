import { getSchoolDayPlan } from "./timetable.js";

function makeCell(tagName, text) {
  const cell = document.createElement(tagName);
  cell.textContent = text;
  return cell;
}

function noSchoolMessage(view) {
  if (view.noSchoolReason === "school_disabled") {
    return "There is no school scheduled for you today.";
  }
  if (view.noSchoolReason === "timetable_unavailable") {
    return "There is no school timetable available for today.";
  }
  if (view.noSchoolReason === "out_of_term") {
    return "There is no school for you today. School is currently out of term.";
  }

  const holiday = view.day.holidays[0];
  if (holiday) return `There is no school for you today because it is ${holiday}.`;
  if (view.day.isWeekend) return "There is no school for you today. It is the weekend.";
  return "There is no school for you today.";
}

export function renderSchoolDiary(
  game,
  { dateElement, contentElement, formatDate },
) {
  const view = getSchoolDayPlan(game);
  dateElement.textContent = formatDate(new Date(view.date));
  contentElement.replaceChildren();

  const entry = document.createElement("section");
  entry.className = "diary-entry";

  const heading = document.createElement("h3");
  heading.textContent = view.school.name;

  const location = document.createElement("p");
  location.className = "diary-school-location";
  location.textContent = `Located in ${view.school.districtName}.`;
  entry.append(heading, location);

  if (!view.hasSchool) {
    const notice = document.createElement("p");
    notice.className = "diary-empty";
    notice.textContent = noSchoolMessage(view);
    entry.append(notice);
    contentElement.append(entry);
    return;
  }

  const summary = document.createElement("p");
  summary.className = "diary-school-summary";
  summary.textContent =
    `You have to go to school from ${view.school.start} to ${view.school.end}.`;

  const table = document.createElement("table");
  table.className = "diary-schedule";

  const caption = document.createElement("caption");
  caption.textContent = "Today's classes";

  const tableHead = document.createElement("thead");
  const headingRow = document.createElement("tr");
  headingRow.append(
    makeCell("th", "Time"),
    makeCell("th", "Class / activity"),
  );
  tableHead.append(headingRow);

  const tableBody = document.createElement("tbody");
  for (const period of view.school.periods) {
    const row = document.createElement("tr");
    row.append(
      makeCell("td", `${period.start}–${period.end}`),
      makeCell("td", period.label),
    );
    tableBody.append(row);
  }

  table.append(caption, tableHead, tableBody);
  entry.append(summary, table);
  contentElement.append(entry);
}
