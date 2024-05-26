const userIdToName = {};

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
            channel.reflectionCount++;
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
        row.innerHTML = `
            <td>${channelName}</td>
            <td>${channel.mergedCount}</td>
            <td>${channel.closedCount}</td>
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
            const channels = {};
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
    const denominator = (channel.mergedCount * 2) + channel.closedCount;
    return denominator > 0 ? channel.reflectionCount * 100 / denominator : 0;
}

document.getElementById('teamFilterInput').addEventListener('keyup', function () {
    filterTable();
});

function filterTable() {
    const input = document.getElementById('teamFilterInput');
    const filter = input.value.toLowerCase();
    const table = document.getElementById('dataTable');
    const rows = table.getElementsByTagName('tr');

    for (let i = 1; i < rows.length; i++) { // Start at 1 to skip header row
        const cells = rows[i].getElementsByTagName('td');
        const channelName = cells[0].textContent.toLowerCase();

        if (channelName.includes(filter)) {
            rows[i].style.display = '';
        } else {
            rows[i].style.display = 'none';
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
        });
    });
}

// Call the function to make the table sortable
makeTableSortable();
