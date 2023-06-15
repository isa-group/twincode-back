# Twincode
Twincode is a simple collaborative coding in JS for pair programming;
you can try a **on-line demo** deployment at: https://twincode.netlify.app

This repo correspond with the BACKEND of the platform.

### Running the server

To run the server, just use:

```
npm install 
npm start
```

Then, if running in localhost, you start a new room: `http://localhost:8080/`

## DB Admin
Firstly, you will need to have previously installed the [MongoDB Database Tools](https://www.mongodb.com/docs/database-tools/installation/installation/). The installation will include mongodump (to create a database backup) and mongorestore (to import/restore the database using the previously created backup).

### Database Backup
To create a backup of a mongo database use the following command in the console:

```
mongodump --uri "mongodb://user:password@server/database" --out "C:\example\location"
```

In case you were not provided with an uri or you are trying to dump data from a local database, you will need to specify every parameter separately:

```
mongodump --host 127.0.0.1 --port 27017 --username user --password pass --out "C:\example\location"
```

### Database Restoration

You can import a dabatabase by typing the next line in your console:

```
mongorestore -h 127.0.0.1:27017 -d database_name "C:\backup\location"
```

