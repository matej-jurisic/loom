using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Loom.Core.Migrations
{
    /// <inheritdoc />
    public partial class AddRecurrence : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Occurrences_ActivityId",
                table: "Occurrences");

            migrationBuilder.AddColumn<DateOnly>(
                name: "SeriesDate",
                table: "Occurrences",
                type: "TEXT",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "ActivityRecurrences",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    ActivityId = table.Column<Guid>(type: "TEXT", nullable: false),
                    Frequency = table.Column<string>(type: "TEXT", nullable: false),
                    Interval = table.Column<int>(type: "INTEGER", nullable: false),
                    WeekdayMask = table.Column<int>(type: "INTEGER", nullable: false),
                    StartDate = table.Column<DateOnly>(type: "TEXT", nullable: false),
                    EndDate = table.Column<DateOnly>(type: "TEXT", nullable: true),
                    TimeOfDay = table.Column<TimeOnly>(type: "TEXT", nullable: true),
                    DurationMinutes = table.Column<int>(type: "INTEGER", nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ActivityRecurrences", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ActivityRecurrences_Activities_ActivityId",
                        column: x => x.ActivityId,
                        principalTable: "Activities",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Occurrences_ActivityId_SeriesDate",
                table: "Occurrences",
                columns: new[] { "ActivityId", "SeriesDate" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_ActivityRecurrences_ActivityId",
                table: "ActivityRecurrences",
                column: "ActivityId",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ActivityRecurrences");

            migrationBuilder.DropIndex(
                name: "IX_Occurrences_ActivityId_SeriesDate",
                table: "Occurrences");

            migrationBuilder.DropColumn(
                name: "SeriesDate",
                table: "Occurrences");

            migrationBuilder.CreateIndex(
                name: "IX_Occurrences_ActivityId",
                table: "Occurrences",
                column: "ActivityId");
        }
    }
}
