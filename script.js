const userIdToName = {};

function wrapHtml(content) {
    // Convert the content to a JSON string and escape HTML special characters
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
            <td>${channel.messageCount}</td>
            <td class="messages">${formatMessageCounts(channel.users, userIdToName)}</td>
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
            // Remove the redeclaration of userIdToName here
            const promises = [];

            // Collect user info if users.json exists
            if (zip.file("users.json")) {
                const usersPromise = zip.file("users.json").async("string").then(function (content) {
                    const users = JSON.parse(content);
                    users.forEach(user => {
                        if (user.id && user.name) {
                            userIdToName[user.id] = user.name;
                        }
                        else {
                            console.error("Invalid user object: id or name is missing.");
                        }
                    });
                });
                promises.push(usersPromise);
            }
            zip.forEach(function (relativePath, zipEntry) {
                if (zipEntry.dir) return; // Skip directories
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
    // Ensure userIdToName is defined before attempting to access it
    if (!userIdToName) {
        return "User mapping not available";
    }

    return Object.entries(users).map(([userId, count]) => {
        const userName = userIdToName[userId] || userId; // Look up user name using user ID
        return `${userName}: ${count}`;
    }).join('<br>');
}
// Filter functions
function messageFilter(message) {
    return message.text && message.text.length > 0;
}

function mergedFilter(message) {
    const regex = /PR\s.*\smerged\s:\white_check_mark\:/i;
    return message.text && regex.test(message.text);
}

function closedFilter(message) {
    // Regular expression pattern to match either "was merged" or "was :x: closed but not merged!"
    const pattern = /:thinking_face: Hello from reflection bot! :thinking_face:\s*(PR\s.*?(?=\s*(was\s*merged|:x:\s*closed but not merged)))/i;
    return message.text && pattern.test(message.text);
}

function reflectionFilter(message) {
    // Regular expression pattern to match reflection bot messages
    const pattern = /:thinking_face: Hello from reflection bot! :thinking_face:\s*(PR\s.*?(?=\s*(was\s*merged|:x:\s*closed but not merged)))/i;

    // Check if the message text matches the pattern and if there is at least one reply
    return message.text && pattern.test(message.text) && message.reply_count && message.reply_count >= 1;
}

function calculateGrade(channel) {
    const denominator = (channel.mergedCount * 2) + channel.closedCount;
    return denominator > 0 ? channel.reflectionCount / denominator : 0;
}


// Input field keyup event listener for dynamic filtering
document.getElementById('teamFilterInput').addEventListener('keyup', function () {
    filterTable();
});

function filterTable() {
    const input = document.getElementById('teamFilterInput').value.toLowerCase();
    const rows = document.getElementById('dataTable').getElementsByTagName('tr');

    for (let i = 1; i < rows.length; i++) {
        const channelName = rows[i].getElementsByTagName('td')[0].textContent.toLowerCase();
        if (channelName.includes(input)) {
            rows[i].style.display = "";
        } else {
            rows[i].style.display = "none";
        }
    }
}

function wrapHtml(content) {
    // Convert the content to a JSON string and escape HTML special characters
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
