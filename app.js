function readZipFile() {
    console.log('readZipFile function called');
    const fileInput = document.getElementById('fileUpload');
    const file = fileInput.files[0];

    JSZip.loadAsync(file).then(function (zip) {
        console.log('zip file loaded');
        let channelPromises = [];

        zip.forEach(function (relativePath, zipEntry) {
            console.log('processing zip entry:', relativePath);
            if (zipEntry.dir) {
                console.log('processing directory:', zipEntry.name);
                let channelName = zipEntry.name;
                let totalMessages = 0;
                let patternMessages = 0;
                let users = {};

                let channelFiles = zip.file(new RegExp('^' + channelName + '.*\.json$'));
                console.log('channelFiles:', channelFiles);

                let filePromises = channelFiles.map(function (zipEntry) {
                    return zipEntry.async('string').then(function (content) {
                        console.log('processing file:', zipEntry.name);
                        let messages = JSON.parse(content).messages;
                        console.log('messages:', messages);
                        // ... rest of the code
                    });
                });

                let channelPromise = Promise.all(filePromises).then(function () {
                    return {
                        name: channelName,
                        total: totalMessages,
                        pattern: patternMessages,
                        users: users
                    };
                });

                console.log('channelPromise:', channelPromise);
                channelPromises.push(channelPromise);
            }
        });

        console.log('channelPromises:', channelPromises);
        return Promise.all(channelPromises);
    }).then(function (channels) {
        console.log('channels:', channels);
        // ... rest of the code
    }).catch(function (error) {
        console.error('Error processing zip file:', error);
    });
}