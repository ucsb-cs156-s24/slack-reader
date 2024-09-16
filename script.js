const userIdToName = {};
let channels = {};
function wrapHtml(content) {
    const jsonString = JSON.stringify(content);
    return jsonString.replace(/[&<>"']/g, function (match) {
        return {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        }[match];
    });
}

function processMessages(messages, channel, userIdToName) {
    messages.forEach(message => {
        if (messageFilter(message)) {
            channel.messageCount++;
        }
        const userId = message.user || "unknown";
        const userName = userIdToName[userId] || userId; // Look up user name using user ID
        if (!channel.users[userName]) {
            channel.users[userName] = 0;
        }
        channel.users[userName]++;
        if (mergedFilter(message)) {
            channel.mergedCount++;
        }
        if (closedFilter(message)) {
            channel.closedCount++;
        }
        if (reflectionFilter(message)) {
            channel.reflectionCount += message.reply_count;
        }
    });
}

function populateTableAndAccordion(channels) {
    const tbody = document.getElementById('dataTable').querySelector('tbody');
    const accordion = document.getElementById('accordion');
    Object.keys(channels).forEach((channelName, index) => {
        const channel = channels[channelName];
        const grade = calculateGrade(channel);
        const row = document.createElement('tr');
        const closedNotMergedCount = channel.closedCount - channel.mergedCount;
        row.innerHTML = `
            <td>${channelName}</td>
            <td>${channel.mergedCount}</td>
            <td>${closedNotMergedCount}</td>
            <td>${channel.reflectionCount}</td>
            <td>${grade.toFixed(2)}</td>
        `;
        tbody.appendChild(row);

        const logsHtml = channel.logs.map(log => `
            <h6>File: ${log.file}</h6>
            <pre>${wrapHtml(log.content)}</pre> <!-- Escaping HTML here -->
        `).join('');

        const accordionItem = document.createElement('div');
        accordionItem.classList.add('accordion-item');
        accordionItem.setAttribute('data-channel-name', channelName.toLowerCase());
        accordionItem.innerHTML = `
            <h2 class="accordion-header" id="heading${index}">
                <button class="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#collapse${index}" aria-expanded="false" aria-controls="collapse${index}">
                    ${channelName}
                </button>
            </h2>
            <div id="collapse${index}" class="accordion-collapse collapse" aria-labelledby="heading${index}" data-bs-parent="#accordion">
                <div class="accordion-body">
                    <p><strong>Message Count:</strong> ${channel.messageCount}</p>
                    <p><strong>Message Breakdown:</strong></p>
                    <pre>${formatMessageCounts(channel.users, userIdToName)}</pre>
                    ${logsHtml}
                </div>
            </div>
        `;
        accordion.appendChild(accordionItem);
    });
}

document.getElementById('fileInput').addEventListener('change', function (event) {
    const file = event.target.files[0];
    if (file) {
        JSZip.loadAsync(file).then(function (zip) {
            const promises = [];

            if (zip.file("users.json")) {
                const usersPromise = zip.file("users.json").async("string").then(function (content) {
                    const users = JSON.parse(content);
                    users.forEach(user => {
                        if (user.id && user.name) {
                            userIdToName[user.id] = user.name;
                        }
                    });
                });
                promises.push(usersPromise);
            }
            zip.forEach(function (relativePath, zipEntry) {
                if (zipEntry.dir) return;
                if (relativePath.endsWith('.json') && relativePath !== "users.json") {
                    const promise = zipEntry.async("string").then(function (content) {
                        try {
                            const messages = JSON.parse(content);
                            if (Array.isArray(messages)) {
                                const channelName = relativePath.split('/')[0];
                                if (!channels[channelName]) {
                                    channels[channelName] = {
                                        messageCount: 0,
                                        users: {},
                                        mergedCount: 0,
                                        closedCount: 0,
                                        reflectionCount: 0,
                                        logs: []
                                    };
                                }
                                channels[channelName].logs.push({ file: relativePath, content: messages });
                                processMessages(messages, channels[channelName], userIdToName);
                            } else {
                                console.error("Invalid JSON content: messages is not an array.");
                            }
                        } catch (error) {
                            console.error("Error parsing JSON content:", error);
                        }
                    });
                    promises.push(promise);
                }
            });
            Promise.all(promises).then(() => {
                populateTableAndAccordion(channels);
            });
        });
    }
});

function formatMessageCounts(users, userIdToName) {
    if (!userIdToName) {
        return "User mapping not available";
    }
    const aggregatedCounts = {};
    Object.entries(users).forEach(([userId, count]) => {
        const userName = userIdToName[userId] || userId;
        if (!aggregatedCounts[userName]) {
            aggregatedCounts[userName] = count;
        } else {
            aggregatedCounts[userName] += count;
        }
    });
    return Object.entries(aggregatedCounts).map(([userName, count]) => {
        return `${userName}: ${count}`;
    }).join('<br>');
}

function messageFilter(message) {
    return message;
}

function mergedFilter(message) {
    const regex = /PR\s.*\smerged\s:\white_check_mark\:/i;
    return message.text && regex.test(message.text);
}

function closedFilter(message) {
    const pattern = /:thinking_face: Hello from reflection bot! :thinking_face:\s*(PR\s.*?(?=\s*(was\s*merged|:x:\s*closed but not merged)))/i;
    return message.text && pattern.test(message.text);
}

function reflectionFilter(message) {
    const pattern = /:thinking_face: Hello from reflection bot! :thinking_face:\s*(PR\s.*?(?=\s*(was\s*merged|:x:\s*closed but not merged)))/i;
    return message.text && pattern.test(message.text) && message.reply_count && message.reply_count >= 1;
}


function calculateGrade(channel) {
    const closedNotMergedCount = channel.closedCount - channel.mergedCount;
    const denominator = (channel.mergedCount * 2) + closedNotMergedCount;
    const rawGrade = denominator > 0 ? channel.reflectionCount * 100 / denominator : 0;
    return (rawGrade <= 100.0) ? rawGrade : 100.0;
}

document.getElementById('teamFilterInput').addEventListener('keyup', function () {
    filterTableAndAccordion();
});

function filterTableAndAccordion() {
    const input = document.getElementById('teamFilterInput');
    const filter = input.value.toLowerCase();
    const table = document.getElementById('dataTable');
    const rows = table.getElementsByTagName('tr');
    const accordion = document.getElementById('accordion');
    const accordionItems = accordion.getElementsByClassName('accordion-item');

    // Filter table rows
    for (let i = 1; i < rows.length; i++) { // Start at 1 to skip header row
        const cells = rows[i].getElementsByTagName('td');
        const channelName = cells[0].textContent.toLowerCase();

        if (channelName.includes(filter)) {
            rows[i].style.display = '';
        } else {
            rows[i].style.display = 'none';
        }
    }

    // Filter accordion items
    for (let i = 0; i < accordionItems.length; i++) {
        const accordionItem = accordionItems[i];
        const channelName = accordionItem.getAttribute('data-channel-name');

        if (channelName.includes(filter)) {
            accordionItem.style.display = '';
        } else {
            accordionItem.style.display = 'none';
        }
    }
}

// Function to make table columns sortable
function makeTableSortable() {
    const table = document.getElementById('dataTable');
    const headers = table.querySelectorAll('th');

    headers.forEach(header => {
        header.addEventListener('click', () => {
            const columnIndex = Array.from(headers).indexOf(header);
            const rows = Array.from(table.querySelectorAll('tbody tr'));
            let direction = header.dataset.sortDirection || 'asc';

            // Toggle sort direction and update icon
            if (direction === 'asc') {
                header.querySelector('i').textContent = 'arrow_downward'; // Change icon to downward arrow
                direction = 'desc';
            } else {
                header.querySelector('i').textContent = 'arrow_upward'; // Change icon to upward arrow
                direction = 'asc';
            }

            // Sort rows based on the content of the clicked column
            rows.sort((a, b) => {
                const aValue = a.cells[columnIndex].textContent.trim().toLowerCase();
                const bValue = b.cells[columnIndex].textContent.trim().toLowerCase();

                if (direction === 'asc') {
                    return aValue.localeCompare(bValue);
                } else {
                    return bValue.localeCompare(aValue);
                }
            });

            // Update sort direction
            header.dataset.sortDirection = direction;

            // Clear existing table rows
            table.querySelector('tbody').innerHTML = '';

            // Append sorted rows to the table
            rows.forEach(row => {
                table.querySelector('tbody').appendChild(row);
            });

            // Sort accordion items in the same order as table rows
            sortAccordionItems(rows, columnIndex, direction);
        });
    });
}

// Function to sort accordion items based on table sorting
function sortAccordionItems(sortedRows, columnIndex, direction) {
    const accordion = document.getElementById('accordion');
    const accordionItems = Array.from(accordion.getElementsByClassName('accordion-item'));

    // Extract channel names from sorted table rows
    const sortedChannelNames = sortedRows.map(row => row.cells[0].textContent.trim().toLowerCase());

    // Sort accordion items based on sorted channel names
    accordionItems.sort((a, b) => {
        const aChannelName = a.getAttribute('data-channel-name');
        const bChannelName = b.getAttribute('data-channel-name');
        const aIndex = sortedChannelNames.indexOf(aChannelName);
        const bIndex = sortedChannelNames.indexOf(bChannelName);

        if (direction === 'asc') {
            return aIndex - bIndex;
        } else {
            return bIndex - aIndex;
        }
    });

    // Clear existing accordion items
    accordion.innerHTML = '';

    // Append sorted accordion items to the accordion
    accordionItems.forEach(item => {
        accordion.appendChild(item);
    });
}

// Call the function to make the table sortable
makeTableSortable();

function escapeCSV(value) {
    if (typeof value === 'string') {
        // Escape double quotes by doubling them and wrap the value in double quotes if it contains commas, newlines, or double quotes
        if (value.includes(',') || value.includes('\n') || value.includes('"')) {
            value = `"${value.replace(/"/g, '""')}"`;
        }
    }
    return value;
}

function escapeCSV(value) {
    if (typeof value === 'string') {
        // Escape double quotes by doubling them and wrap the value in double quotes if it contains commas, newlines, or double quotes
        if (value.includes(',') || value.includes('\n') || value.includes('"')) {
            value = `"${value.replace(/"/g, '""')}"`;
        }
    }
    return value;
}

function escapeCSV(value) {
    if (typeof value === 'string') {
        // Escape double quotes by doubling them and wrap the value in double quotes if it contains commas, newlines, or double quotes
        if (value.includes(',') || value.includes('\n') || value.includes('"')) {
            value = `"${value.replace(/"/g, '""')}"`;
        }
    }
    return value;
}

function escapeCSV(value) {
    if (typeof value === 'string') {
        // Escape double quotes by doubling them and wrap the value in double quotes if it contains commas, newlines, or double quotes
        if (value.includes(',') || value.includes('\n') || value.includes('"')) {
            value = `"${value.replace(/"/g, '""')}"`;
        }
    }
    return value;
}

function escapeCSV(value) {
    if (typeof value === 'string') {
        // Escape double quotes by doubling them and wrap the value in double quotes if it contains commas, newlines, or double quotes
        if (value.includes(',') || value.includes('\n') || value.includes('"')) {
            value = `"${value.replace(/"/g, '""')}"`;
        }
    }
    return value;
}

function isReflection(message) {
    // Define the user ID of the slack-bot
    const slackBotUserId = 'U073E1ZUGG6';

    // Define patterns to match reflection messages
    const patterns = [
        /:thinking_face: Hello from reflection bot! :thinking_face:\n PR <.*?> was merged :white_check_mark:.\n \*Each team member that was involved in this PR \(either coding or code review\)\*, please now write a brief reflection \*as a reply thread to this post\* on what you as an individual, or your team, learned from this PR, if anything\.\n Note that your team will be graded on two aspects:\n \n  \(1\) the percentage of prompts like this one to which your team responds,\n \n  \(2\) the quality of your responses\.\n\n\nSee <.*?> for details\./i,
        /:thinking_face: Hello from reflection bot! :thinking_face:\n PR <.*?> was :x: closed but not merged! :x: \n \*Each team member that was involved in this PR \(either coding or code review\)\*, please now write a brief reflection \*as a reply thread to this post\* on what you as an individual, or your team, learned from this PR, if anything\.\n Note that your team will be graded on two aspects:\n \n  \(1\) the percentage of prompts like this one to which your team responds,\n \n  \(2\) the quality of your responses\.\n\n\nSee <.*?> for details\./i
        // Add any other user-defined patterns here
    ];

    // Check if message is from the slack-bot
    if (message.user !== slackBotUserId) return false;

    // Check if the message text matches any of the patterns
    return patterns.some(pattern => pattern.test(message.text));
}

function escapeCSV(value) {
    if (typeof value === 'string') {
        // Escape double quotes by doubling them and wrap the value in double quotes if it contains commas, newlines, or double quotes
        if (value.includes(',') || value.includes('\n') || value.includes('"')) {
            value = `"${value.replace(/"/g, '""')}"`;
        }
    }
    return value;
}

function isReflection(message) {
    // Define the user ID of the slack-bot
    const slackBotUserId = 'U073E1ZUGG6';

    // Define patterns to match reflection messages
    const patterns = [
        /:thinking_face: Hello from reflection bot! :thinking_face:\n PR <.*?> was merged :white_check_mark:.\n \*Each team member that was involved in this PR \(either coding or code review\)\*, please now write a brief reflection \*as a reply thread to this post\* on what you as an individual, or your team, learned from this PR, if anything\.\n Note that your team will be graded on two aspects:\n \n  \(1\) the percentage of prompts like this one to which your team responds,\n \n  \(2\) the quality of your responses\.\n\n\nSee <.*?> for details\./i,
        /:thinking_face: Hello from reflection bot! :thinking_face:\n PR <.*?> was :x: closed but not merged! :x: \n \*Each team member that was involved in this PR \(either coding or code review\)\*, please now write a brief reflection \*as a reply thread to this post\* on what you as an individual, or your team, learned from this PR, if anything\.\n Note that your team will be graded on two aspects:\n \n  \(1\) the percentage of prompts like this one to which your team responds,\n \n  \(2\) the quality of your responses\.\n\n\nSee <.*?> for details\./i
        // Add any other user-defined patterns here
    ];

    // Check if message is from the slack-bot
    if (message.user !== slackBotUserId) return false;

    // Check if the message text matches any of the patterns
    return patterns.some(pattern => pattern.test(message.text));
}

function generateCSV() {
    const rows = [];
    let totalMessages = 0;
    const reflectionThreadIds = new Set();

    // Add table headers
    rows.push(['Channel', 'UTC Timestamp', 'User', 'Message ID', 'Thread ID', 'Text', 'isReflection']);

    Object.keys(channels).forEach(channelName => {
        const channel = channels[channelName];

        channel.logs.forEach(log => {
            log.content.forEach(message => {
                const userName = userIdToName[message.user] || message.user || 'unknown';
                const messageId = message.client_msg_id || message.ts || 'unknown';
                const threadId = message.thread_ts || 'none';
                const utcTimestamp = message.ts ? new Date(parseFloat(message.ts) * 1000).toISOString() : 'unknown';
                const text = message.text ? message.text.replace(/[\r\n]+/g, ' ') : 'No text available';
                const isReflectionMessage = isReflection(message) ? 1 : 0;

                // If the message is a reflection message, add its thread ID to the set
                if (isReflectionMessage && threadId !== 'none') {
                    reflectionThreadIds.add(threadId);
                }

                // Add message details to the CSV rows
                rows.push([
                    escapeCSV(channelName),
                    escapeCSV(utcTimestamp),
                    escapeCSV(userName),
                    escapeCSV(messageId),
                    escapeCSV(threadId),
                    escapeCSV(text),
                    isReflectionMessage
                ]);

                totalMessages++;
            });
        });
    });

    // Update the isReflection column for messages that are replies to reflection messages
    rows.forEach(row => {
        const threadId = row[4]; // Thread ID is the 5th column
        if (threadId !== 'none' && reflectionThreadIds.has(threadId)) {
            row[6] = 1; // isReflection is the 7th column
        }
    });

    console.log(`Total messages processed: ${totalMessages}`); // Debugging statement
    console.log(`Total rows in CSV: ${rows.length}`); // Debugging statement

    // Convert rows to CSV string
    const csvContent = rows.map(row => row.join(",")).join("\n");

    // Create a Blob from the CSV string
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    // Create a temporary link to download the CSV
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'slack_messages.csv');
    document.body.appendChild(link);

    // Trigger the download
    link.click();

    // Clean up
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

document.getElementById('downloadCSV').addEventListener('click', function () {
    generateCSV();
});