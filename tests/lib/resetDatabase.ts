import { Meteor } from "meteor/meteor";
import { MongoInternals } from "meteor/mongo";

// Track whether we're currently resetting to prevent concurrent resets
let resetInProgress = false;

/**
 * Resets the database by dropping all non-system collections.
 * This utility ensures test isolation by cleaning up data between tests.
 *
 * Note: This is primarily for server-side testing. Collections are dropped
 * directly rather than removed document-by-document for performance.
 */
export async function resetDatabase(): Promise<void> {
  if (Meteor.isServer) {
    // Prevent concurrent resets
    if (resetInProgress) {
      throw new Error("Database reset already in progress");
    }

    resetInProgress = true;

    try {
      const db = MongoInternals.defaultRemoteCollectionDriver().mongo.db;
      const collections = await db.listCollections().toArray();

      for (const collection of collections) {
        const name = collection.name;

        // Skip system collections and Meteor's internal collections
        if (
          name.startsWith("system.") ||
          name === "meteor_accounts_loginServiceConfiguration" ||
          name === "meteor_oauth_pendingCredentials" ||
          name === "meteor_oauth_pendingRequestTokens"
        ) {
          continue;
        }

        try {
          await db.dropCollection(name);
        } catch (e) {
          // Ignore errors for collections that don't exist
          if (!(e instanceof Error) || !e.message.includes("ns not found")) {
            throw e;
          }
        }
      }
    } finally {
      resetInProgress = false;
    }
  }

  // On client, just ensure we're logged out to avoid issues with
  // mid-call authentication changes
  if (Meteor.isClient && Meteor.userId()) {
    await new Promise<void>((resolve, reject) => {
      Meteor.logout((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }
}
